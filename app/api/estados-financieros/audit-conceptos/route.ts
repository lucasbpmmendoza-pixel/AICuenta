import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb, getDbLong } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AUDIT_MODEL = process.env.AUDIT_MODEL ?? "gpt-4o";

const MAX_ROWS = 200;

interface AuditCfdi {
  uuid: string;
  serie: string;
  folio: string;
  fecha: string; // YYYY-MM-DD
  importe: number;
  contraparte: string;
}

interface ConceptoAuditRaw {
  tipo: "ingreso" | "egreso";
  clave: string;
  satDesc: string;
  emisorDesc: string;
  numConceptos: number;
  importe: number;
  cfdis: AuditCfdi[];
}

// La columna `cfdis` viene del SQL como registros separados por salto de linea
// (CHAR(10)) y campos por tab (CHAR(9)). Deduplica por UUID (un CFDI puede tener
// 2 conceptos con la misma clave/descripcion) sumando el importe de sus partidas.
function parseCfdis(raw: string | null | undefined): AuditCfdi[] {
  if (!raw) return [];
  const byUuid = new Map<string, AuditCfdi>();
  for (const rec of raw.split("\n")) {
    if (!rec) continue;
    const [uuid, serie, folio, fecha, importe, contraparte] = rec.split("\t");
    if (!uuid) continue;
    const imp = Number(importe) || 0;
    const existing = byUuid.get(uuid);
    if (existing) {
      existing.importe += imp;
      continue;
    }
    byUuid.set(uuid, {
      uuid,
      serie: serie ?? "",
      folio: folio ?? "",
      fecha: fecha ?? "",
      importe: imp,
      contraparte: contraparte ?? "",
    });
  }
  return [...byUuid.values()];
}

interface CedulaContext {
  razonSocial: string | null;
  actividades: string[];
  regimenes: string[];
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function loadCedula(rfc: string): Promise<CedulaContext | null> {
  const db = await getDb();
  const r = await db
    .request()
    .input("rfc", rfc)
    .query<{
      razon_social: string | null;
      nombre: string | null;
      actividades_economicas: string | null;
      regimenes: string | null;
    }>(`
      SELECT TOP 1 razon_social, nombre, actividades_economicas, regimenes
      FROM cedulas_fiscales WITH (NOLOCK)
      WHERE rfc = @rfc AND activo = 1
      ORDER BY id DESC
    `);
  const row = r.recordset[0];
  if (!row) return null;
  const acts = safeJsonParse<Array<{ actividad?: string; porcentaje?: string }>>(
    row.actividades_economicas, [],
  );
  const regs = safeJsonParse<Array<{ regimen?: string }>>(row.regimenes, []);
  return {
    razonSocial: row.razon_social ?? row.nombre,
    actividades: acts.map((a) => a.actividad ?? "").filter(Boolean),
    regimenes: regs.map((r) => r.regimen ?? "").filter(Boolean),
  };
}

interface VeredictoGPT {
  i: number;
  v: "ok" | "sospechoso" | "incorrecto";
  r?: string;
}

interface ConceptoAuditResult extends ConceptoAuditRaw {
  veredicto: "ok" | "sospechoso" | "incorrecto" | "sin_catalogo";
  razon: string;
}

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db
    .request()
    .input("uid", userId)
    .input("rfc", rfc)
    .query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc",
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

async function loadConceptos(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<ConceptoAuditRaw[]> {
  const db = await getDbLong();
  // Agrupa por (clave SAT, descripcion emisor) para deduplicar y
  // limitar el tamaño del prompt. tipo separa ingreso/egreso.
  const r = await db
    .request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .query<{
      tipo: string;
      clave: string;
      satDesc: string | null;
      emisorDesc: string;
      numConceptos: number;
      importe: number;
      cfdis: string | null;
    }>(`
      WITH base AS (
        SELECT
          CASE
            WHEN f.RFC_Emisor = @rfc THEN 'ingreso'
            ELSE 'egreso'
          END AS tipo,
          ISNULL(NULLIF(c.ClaveProductoServicio,''), '') AS clave,
          ISNULL(NULLIF(LTRIM(RTRIM(c.Descripcion)),''), '(sin descripcion)') AS emisorDesc,
          ISNULL(c.Importe, 0) AS importe,
          f.UUID AS uuid,
          ISNULL(f.Serie,'') AS serie,
          ISNULL(f.Folio,'') AS folio,
          f.Fecha AS fecha,
          CASE
            WHEN f.RFC_Emisor = @rfc THEN ISNULL(f.RazonSocialReceptor,'')
            ELSE ISNULL(f.RazonSocialEmisor,'')
          END AS contraparte
        FROM facturalo_cfdis f WITH (NOLOCK)
        INNER JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID))
          ON c.UUID = f.UUID AND c.rfc_cliente = @rfc
        WHERE f.Status = 'Vigente'
          AND f.TipoComprobante IN ('I','E')
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
          AND (
                (f.RFC_Emisor   = @rfc AND f.Movimiento = 'Ingreso')
             OR (f.RFC_Receptor = @rfc AND f.Movimiento = 'Egreso')
              )
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY tipo, clave, emisorDesc ORDER BY importe DESC
          ) AS rn
        FROM base
        WHERE clave <> ''
      ),
      grp AS (
        SELECT
          tipo,
          clave,
          emisorDesc,
          COUNT(*) AS numConceptos,
          SUM(importe) AS importe,
          -- Hasta 25 CFDIs por grupo (los de mayor importe). Campos con TAB,
          -- registros con salto de linea. Se sanea la contraparte por si trae
          -- esos caracteres. CONVERT a varchar(max) evita el limite de 8000.
          STRING_AGG(
            CASE WHEN rn <= 25 THEN
              CONVERT(varchar(max), uuid) + CHAR(9)
              + serie + CHAR(9)
              + folio + CHAR(9)
              + CONVERT(varchar(10), fecha, 23) + CHAR(9)
              + CONVERT(varchar(20), CONVERT(decimal(18,2), importe)) + CHAR(9)
              + REPLACE(REPLACE(REPLACE(contraparte, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ')
            END, CHAR(10)
          ) AS cfdis
        FROM ranked
        GROUP BY tipo, clave, emisorDesc
      )
      SELECT TOP ${MAX_ROWS}
        g.tipo,
        g.clave,
        cat.descripcion AS satDesc,
        g.emisorDesc,
        g.numConceptos,
        g.importe,
        g.cfdis
      FROM grp g
      LEFT JOIN tb_catprodserv cat WITH (NOLOCK) ON cat.clave = g.clave
      ORDER BY g.importe DESC
      OPTION (RECOMPILE)
    `);

  return r.recordset.map((row) => ({
    tipo: row.tipo === "ingreso" ? "ingreso" : "egreso",
    clave: row.clave,
    satDesc: (row.satDesc ?? "").trim(),
    emisorDesc: row.emisorDesc,
    numConceptos: Number(row.numConceptos ?? 0),
    importe: Number(row.importe ?? 0),
    cfdis: parseCfdis(row.cfdis),
  }));
}

// Formato compacto tipo TOON: una línea por registro, separado por '|'.
// Reduce ~70% los tokens vs JSON pretty.
function buildToonTable(rows: ConceptoAuditRaw[]): string {
  const header = "i|clave|sat|emisor";
  const lines = rows.map((r, i) => {
    const sat = r.satDesc || "(NO_EN_CATALOGO)";
    const emisor = r.emisorDesc.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 140);
    const satClean = sat.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 140);
    return `${i}|${r.clave}|${satClean}|${emisor}`;
  });
  return [header, ...lines].join("\n");
}

function buildPrompt(toon: string, periodo: string, rfc: string, cedula: CedulaContext | null): string {
  const giroBlock = cedula && (cedula.actividades.length > 0 || cedula.razonSocial)
    ? `
CONTEXTO DEL NEGOCIO (cédula fiscal del RFC ${rfc}) — usar SÓLO en PASO 2/3 como desempate, NUNCA en PASO 1:
${cedula.razonSocial ? `- Razón social: ${cedula.razonSocial}` : ""}
${cedula.actividades.length > 0 ? `- Actividades económicas SAT:\n  · ${cedula.actividades.slice(0, 6).join("\n  · ")}` : ""}
${cedula.regimenes.length > 0 ? `- Regímenes: ${cedula.regimenes.slice(0, 3).join(", ")}` : ""}

`
    : "";

  return `Eres un auditor fiscal mexicano experto en CFDIs. Tabla compacta (separador '|') con conceptos del RFC ${rfc}, periodo ${periodo}.
${giroBlock}
Columnas: i (índice) | clave (ClaveProdServ SAT) | sat (descripción oficial SAT) | emisor (descripción capturada).

═══════════════════════════════════════════════════════
DOS CHEQUEOS QUE COEXISTEN:
  CHEQUEO A (descripción ↔ clave SAT): ¿la descripción del emisor encaja con la descripción oficial del SAT? Este es el chequeo PRINCIPAL.
  CHEQUEO B (negocio): ¿este gasto/ingreso tiene sentido para el giro del RFC? Sólo se usa para DESEMPATAR cuando A es ambiguo.
Los dos se aplican SIEMPRE en este orden — B nunca baja un veredicto que A ya marcó como ok.
═══════════════════════════════════════════════════════

GLOSARIO DE EQUIVALENCIAS MEXICANAS (estas combinaciones SIEMPRE son OK, no las marques sospechoso):
  - MAGNA / MAGNA SIN / MAGNA SIN PLOMO ≡ Gasolina regular menor a 91 octanos.
  - PREMIUM ≡ Gasolina mayor o igual a 91 octanos.
  - DIESEL / DIÉSEL ≡ Diésel.
  - PEMEX + cualquier combustible ≡ combustible.
  - LINEAGE / WORLD OF WARCRAFT / FORTNITE / nombre de un videojuego conocido ≡ Juegos / Software de juegos.
  - VINIL / VINYL / CALCOMANIA / etiqueta adhesiva ≡ Película de impresión / Película plástica.
  - SPOTIFY / NETFLIX / YOUTUBE PREMIUM ≡ Suscripción de software/entretenimiento.
  - UBER / DIDI / RAPPI ≡ Servicios de transporte / Servicios de mensajería.

PASO 1 — APLICA CHEQUEO A. ¿Cae en alguno de estos casos? Si SÍ → v="ok" (NO sigas evaluando, NO uses el giro):
  0) **REGLA DEL SUSTANTIVO CENTRAL** (la más importante): si el sustantivo/producto principal de la clave SAT aparece literalmente o como sinónimo en la descripción del emisor (o viceversa), es OK SIEMPRE, sin importar diferencias de subtipo, procesamiento, marca, presentación, parte del animal, formato o aditivos. Y SIN IMPORTAR EL GIRO DEL NEGOCIO.
     - "Servicios contables" + "Servicios Contables por el mes de Mayo 2026" → ok. Es literalmente lo mismo.
     - "Zanahoria" + "Zanahoria" / "ZANAHORIA FRESCA" / "Zanahoria orgánica" → ok.
     - "Pollo, mínimamente procesado con aditivos" + CUALQUIER cosa con "pollo", "pechuga", "alita", "muslo", "pierna" → ok.
     - "Agua" + "PAQUETE DE 30 BOTELLAS PET DE AGUA" → ok.
     - "Queso" + cualquier tipo de queso (manchego, rallado, en barra, mezcla) → ok.
     - "Cerveza" + cualquier marca o presentación de cerveza → ok.
     - "Carne procesada" + bistec / molida / hamburguesa / arrachera → ok.
     - "Refrescos" + cualquier marca de refresco → ok.
     - "Gasolina regular menor a 91 octanos" + "MAGNA SIN" → ok (ver glosario).
     IMPORTANTE: la palabra compartida debe ser el SUSTANTIVO PRINCIPAL del concepto. NO cuenta compartir palabras genéricas como "Servicios", "Productos", "Bienes", "Equipo", "Insumos", "Material" — esas no son sustantivos centrales, son categorías.
       · "Servicios contables" + "Servicios de limpieza" → NO es ok (sólo comparten "Servicios" que es genérico). Evaluar en PASO 2.
       · "Equipo de cómputo" + "Equipo de refrigeración" → NO es ok (sólo "Equipo"). Evaluar en PASO 2.
  a) La descripción del emisor es una versión más específica, técnica o con marca de lo que dice la clave SAT.
     Ej: "OREO TROCEADA" bajo "Galletas de dulce"; "Aceite Cristal Canola" bajo "Grasa saturada animal".
  b) La descripción cae dentro del paraguas amplio de la clave, aunque no sea literal:
     - "CUOTA DE MANTENIMIENTO" / "SEGUROS" / "energía del local" bajo "Administración de propiedades" → ok.
     - "Consumo de alimentos" bajo "Restaurantes" → ok.
     - "Honorarios legales" / "Honorarios laborales" / cualquier subespecialidad legal bajo "Servicios de derecho comercial" o cualquier servicio legal → ok.
     - "EXHIBICION EN ESPECTACULARES" / "lonas" / cualquier vehículo publicitario bajo "Servicios de campañas publicitarias" o "Publicidad impresa" → ok.
  c) La clave es de "Instituciones bancarias" (84121500) o procesamiento de pagos: TODO lo financiero entra → intereses, tasas de descuento, comisiones, Optblue, renta de TPV. SIEMPRE ok.
  d) Descripción genérica de servicio ("HONORARIOS", "ENVIO", "FLETE", "RENTA", "MANTENIMIENTO", "ANTICIPO", "CONSUMO", "COBRO", "SERVICIO", "ASESORIA", "MENSUALIDAD") que cae en el rubro amplio de la clave:
     - "Servicios contables" + "HONORARIOS" → ok.
     - "Servicios de transporte" + "Envío" → ok.
     - "Servicios de facturación" + "ANTICIPO DEL BIEN O SERVICIO" → ok.
     - "Procesamiento de datos" + "Cobro por TASA DE DESCUENTO" → ok.
  e) Producto compuesto bajo su ingrediente o categoría dominante:
     - "Productos de leche y mantequilla" + "ADEREZO PARA NACHOS" (queso es lácteo) → ok.
     - "Harina y productos de molinos" + "TORTILLA" → ok.

PASO 2 — Si CHEQUEO A NO marcó ok: ¿hay AL MENOS UNA palabra, raíz o concepto compartido entre clave y descripción?
  → SÍ → tentativamente v="sospechoso".
  → NO → tentativamente v="incorrecto".
  Ej: "Servicios de mantenimiento de equipo" + "ARRENDAMIENTO DE EQUIPOS DE PURIFICACION" (comparten "equipos") → sospechoso.
  Ej: "Desodorantes" + "Difusor de Aceite" → sospechoso.

PASO 3 — APLICA CHEQUEO B (giro del negocio) SÓLO si el resultado de PASO 2 fue "sospechoso" o "incorrecto":
  - Si el concepto es un insumo razonable para el giro registrado en cédula → sube un nivel (incorrecto → sospechoso, sospechoso → ok).
  - Si no encaja con el giro → deja el veredicto como está.
  - Ejemplos con giro "boliche / centro de entretenimiento":
    · "Desodorante para calzado" (zapatos rentados) → de sospechoso a ok.
    · "BOLAS DE BOLICHE", "ZAPATOS DE BOLICHE" → ok.
    · "Software educativo" + "Mensualidad de boliches" → de incorrecto a sospechoso (paga membresía).
  - Ejemplos con giro "restaurante": insumos cocina/limpieza/desechables → sube un nivel.
  - Ejemplos con giro "construcción": herramientas, materiales, renta de maquinaria → sube un nivel.
  IMPORTANTE: PASO 3 NUNCA BAJA un veredicto. Si PASO 1 dijo ok, queda ok. Si algo no encaja con el giro, NO se vuelve "incorrecto" por eso — sólo se queda como estaba.

═══════════════════════════════════════════════════════
PRINCIPIO FINAL:
- NO ERES UN INSPECTOR QUE BUSCA ERRORES. Tu trabajo es identificar SÓLO los casos donde clave y descripción no tienen ninguna relación razonable.
- Si el producto/servicio central coincide aunque sea en una palabra → ok, sin importar nada más.
- El SAT acepta clasificaciones laxas.
- Ante la duda: "ok". Si dudas entre "ok" y "sospechoso", elige "ok". Si dudas entre "sospechoso" e "incorrecto", elige "sospechoso".
- Si más del 60% de tus respuestas no son "ok", estás siendo demasiado estricto — revisa de nuevo.
═══════════════════════════════════════════════════════

DATOS:
${toon}

Devuelve SOLO JSON válido sin markdown:
{ "items": [ { "i": 0, "v": "ok|sospechoso|incorrecto", "r": "" } ] }

- Una entrada por línea (mismo i).
- Si v="ok", r="".
- r máximo 100 caracteres, español.`;
}

function cleanJson(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const f = t.indexOf("{");
  const l = t.lastIndexOf("}");
  if (f >= 0 && l > f) t = t.slice(f, l + 1);
  return t;
}

export async function GET(req: NextRequest) {
  const reqId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json(
      { error: "La auditoría con IA no está disponible en modo demo." },
      { status: 403 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const rfc = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc))) {
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });
  }

  const dateFrom = new Date(Date.UTC(year, month - 1, 1));
  const dateTo = new Date(Date.UTC(year, month, 1));
  const periodoLabel = `${String(month).padStart(2, "0")}/${year}`;

  let rows: ConceptoAuditRaw[];
  let cedula: CedulaContext | null = null;
  try {
    [rows, cedula] = await Promise.all([
      loadConceptos(rfc, dateFrom, dateTo),
      loadCedula(rfc).catch(() => null),
    ]);
  } catch (err) {
    console.error(`[audit][${reqId}] db_error:`, (err as Error).message);
    return NextResponse.json({ error: "Error al consultar conceptos" }, { status: 503 });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      rfc,
      periodo: periodoLabel,
      totalRevisados: 0,
      resumen: { ok: 0, sospechoso: 0, incorrecto: 0, sin_catalogo: 0 },
      items: [],
    });
  }

  // Filas que SÍ van al modelo (las que tienen descripción SAT). Las que no
  // están en el catálogo se marcan automáticamente como "sin_catalogo" sin
  // gastar tokens — no hay nada que comparar.
  const toGpt: ConceptoAuditRaw[] = [];
  const idxMap: number[] = []; // toGpt index -> rows index
  rows.forEach((r, idx) => {
    if (r.satDesc) {
      idxMap.push(idx);
      toGpt.push(r);
    }
  });

  const results: ConceptoAuditResult[] = rows.map((r) => ({
    ...r,
    veredicto: r.satDesc ? "ok" : "sin_catalogo",
    razon: r.satDesc ? "" : "La clave no existe en el catálogo SAT vigente.",
  }));

  if (toGpt.length > 0) {
    const toon = buildToonTable(toGpt);
    const prompt = buildPrompt(toon, periodoLabel, rfc, cedula);

    try {
      const t0 = Date.now();
      const completion = await openai.chat.completions.create({
        model: AUDIT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Eres un auditor fiscal mexicano. Devuelves SOLO JSON válido." },
          { role: "user", content: prompt },
        ],
      });
      console.log(`[audit][${reqId}] openai_ms=${Date.now() - t0} rows=${toGpt.length}`);
      const raw = completion.choices[0]?.message?.content?.toString() ?? "";
      if (!raw) throw new Error("Respuesta vacía del modelo");
      const parsed = JSON.parse(cleanJson(raw)) as { items?: VeredictoGPT[] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      for (const it of items) {
        const localIdx = typeof it.i === "number" ? idxMap[it.i] : undefined;
        if (localIdx === undefined) continue;
        const v = it.v === "incorrecto" || it.v === "sospechoso" ? it.v : "ok";
        results[localIdx].veredicto = v;
        results[localIdx].razon = String(it.r ?? "").slice(0, 200).trim();
      }
    } catch (err) {
      console.error(`[audit][${reqId}] openai_error:`, (err as Error).message);
      return NextResponse.json(
        { error: "No se pudo generar la auditoría. Intenta de nuevo." },
        { status: 502 },
      );
    }
  }

  const resumen = results.reduce(
    (acc, r) => {
      acc[r.veredicto]++;
      return acc;
    },
    { ok: 0, sospechoso: 0, incorrecto: 0, sin_catalogo: 0 },
  );

  // Los CFDIs solo se mandan al cliente para las filas que el usuario querra
  // revisar (alerta / incorrecto / sin catalogo). Las "ok" no los necesitan y
  // arrastrarlos infla el JSON.
  const items = results.map((r) =>
    r.veredicto === "ok" ? { ...r, cfdis: [] } : r,
  );

  return NextResponse.json({
    ok: true,
    rfc,
    periodo: periodoLabel,
    totalRevisados: results.length,
    resumen,
    items,
    giro: cedula?.actividades.length ? cedula.actividades.slice(0, 3) : null,
  });
}
