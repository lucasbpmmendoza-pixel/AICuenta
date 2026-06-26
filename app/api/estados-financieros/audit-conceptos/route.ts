import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb, getDbLong } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AUDIT_MODEL = process.env.AUDIT_MODEL ?? "gpt-4o";

const MAX_ROWS = 200;

interface ConceptoAuditRaw {
  tipo: "ingreso" | "egreso";
  clave: string;
  satDesc: string;
  emisorDesc: string;
  numConceptos: number;
  importe: number;
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
    }>(`
      WITH base AS (
        SELECT
          CASE
            WHEN f.RFC_Emisor = @rfc THEN 'ingreso'
            ELSE 'egreso'
          END AS tipo,
          ISNULL(NULLIF(c.ClaveProductoServicio,''), '') AS clave,
          ISNULL(NULLIF(LTRIM(RTRIM(c.Descripcion)),''), '(sin descripcion)') AS emisorDesc,
          ISNULL(c.Importe, 0) AS importe
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
      )
      SELECT TOP ${MAX_ROWS}
        b.tipo,
        b.clave,
        cat.descripcion AS satDesc,
        b.emisorDesc,
        COUNT(*) AS numConceptos,
        SUM(b.importe) AS importe
      FROM base b
      LEFT JOIN tb_catprodserv cat WITH (NOLOCK) ON cat.clave = b.clave
      WHERE b.clave <> ''
      GROUP BY b.tipo, b.clave, cat.descripcion, b.emisorDesc
      ORDER BY SUM(b.importe) DESC
      OPTION (HASH GROUP, RECOMPILE)
    `);

  return r.recordset.map((row) => ({
    tipo: row.tipo === "ingreso" ? "ingreso" : "egreso",
    clave: row.clave,
    satDesc: (row.satDesc ?? "").trim(),
    emisorDesc: row.emisorDesc,
    numConceptos: Number(row.numConceptos ?? 0),
    importe: Number(row.importe ?? 0),
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

function buildPrompt(toon: string, periodo: string, rfc: string): string {
  return `Eres un auditor fiscal mexicano experto en CFDIs. Tabla compacta (separador '|') con conceptos del RFC ${rfc}, periodo ${periodo}.

Columnas: i (índice) | clave (ClaveProdServ SAT) | sat (descripción oficial SAT) | emisor (descripción capturada).

═══════════════════════════════════════════════════════
TAREA: para cada línea, ejecuta este ÁRBOL DE DECISIÓN en orden estricto.
═══════════════════════════════════════════════════════

PASO 1 — ¿Es uno de estos casos? Si SÍ → v="ok" (NO sigas evaluando):
  0) **REGLA DEL SUSTANTIVO CENTRAL** (la más importante): si el producto principal de la clave SAT aparece en la descripción del emisor (o viceversa), es OK SIEMPRE, sin importar diferencias de subtipo, procesamiento, marca, presentación, parte del animal, formato o aditivos.
     - "Pollo, mínimamente procesado con aditivos" + CUALQUIER cosa con "pollo", "pechuga", "alita", "muslo", "pierna" → ok. El pollo es pollo.
     - "Agua" + "PAQUETE DE 30 BOTELLAS PET DE AGUA" → ok. Es agua.
     - "Queso" + cualquier tipo de queso (manchego, rallado, en barra, mezcla) → ok.
     - "Cerveza" + cualquier marca o presentación de cerveza → ok.
     - "Carne procesada" + bistec / molida / hamburguesa / arrachera → ok.
     - "Refrescos" + cualquier marca de refresco → ok.
     Esta regla cubre el 90% de los casos. ÚSALA antes que cualquier otra.
  a) La descripción del emisor es una versión más específica, técnica o con marca de lo que dice la clave SAT.
     Ej: "OREO TROCEADA" bajo "Galletas de dulce"; "Aceite Cristal Canola" bajo "Grasa saturada animal".
  b) La descripción cae dentro del paraguas amplio de la clave, aunque no sea literal:
     - "CUOTA DE MANTENIMIENTO" / "SEGUROS" / "energía del local" bajo "Administración de propiedades" → ok (todos son cargos accesorios al inmueble).
     - "Consumo de alimentos" bajo "Restaurantes" → ok.
     - "Honorarios legales" / "Honorarios laborales" / cualquier subespecialidad legal bajo "Servicios de derecho comercial" o cualquier servicio legal → ok.
     - "EXHIBICION EN ESPECTACULARES" / "lonas" / cualquier vehículo publicitario bajo "Servicios de campañas publicitarias" o "Publicidad impresa" → ok.
  c) La clave es de "Instituciones bancarias" (84121500) o procesamiento de pagos: TODO lo financiero entra → intereses gravables, intereses exentos, intereses sujetos a IVA, tasas de descuento (débito, crédito, internacional, nacional), comisiones, cobros, Optblue, renta de TPV, administración de terminal. SIEMPRE ok.
  d) Descripción genérica de servicio ("HONORARIOS", "ENVIO", "FLETE", "RENTA", "MANTENIMIENTO", "ANTICIPO", "CONSUMO", "COBRO", "SERVICIO", "ASESORIA", "MENSUALIDAD") que cae en el rubro amplio de la clave:
     - "Servicios contables" + "HONORARIOS" → ok.
     - "Servicios de transporte" + "Envío" → ok.
     - "Servicios de facturación" + "ANTICIPO DEL BIEN O SERVICIO" → ok (el anticipo se factura con esta clave por norma SAT).
     - "Procesamiento de datos" + "Cobro por TASA DE DESCUENTO" → ok.
  e) Producto compuesto bajo su ingrediente o categoría dominante:
     - "Productos de leche y mantequilla" + "ADEREZO PARA NACHOS" (queso es lácteo) → ok.
     - "Harina y productos de molinos" + "TORTILLA" (es producto de molino) → ok.

PASO 2 — Si NO cae en PASO 1: ¿hay AL MENOS UNA palabra, raíz o concepto compartido entre clave y descripción? (mismo rubro amplio, terminología relacionada, producto/servicio que el negocio del RFC razonablemente usaría)
  → SÍ → v="sospechoso" (con razón corta).
  Ej: "Servicios de mantenimiento de equipo" + "ARRENDAMIENTO DE EQUIPOS DE PURIFICACION" (comparten "equipos") → sospechoso.
  Ej: "Desodorantes" + "Difusor de Aceite" (relación aroma/ambiente) → sospechoso.
  Ej: "Desodorantes" + "Desodorante para calzado" si el RFC es boliche (renta zapatos) → sospechoso.

PASO 3 — Sólo si NO hay NINGUNA conexión posible: v="incorrecto".
  Ej: "Software educativo" + "Mensualidad de boliches" → incorrecto.
  Ej: "Servicios de facturación" + "TYSON MEGA D" (pollo) → incorrecto.
  Ej: "Arroz" + "Servicios de consultoría" → incorrecto.

═══════════════════════════════════════════════════════
PRINCIPIO FINAL:
- NO ERES UN INSPECTOR QUE BUSCA ERRORES. Tu trabajo NO es encontrar diferencias entre la clave y la descripción — es identificar SÓLO los casos donde no hay forma humana razonable de relacionarlas.
- Si el producto/servicio central coincide aunque sea en una palabra → ok.
- El SAT acepta clasificaciones laxas. Una factura con clave "Pollo procesado" y descripción "Pechuga" NO se rechaza nunca.
- Ante la duda: "ok". Si dudas entre "ok" y "sospechoso", elige "ok". Si dudas entre "sospechoso" e "incorrecto", elige "sospechoso".
- Si más del 60% de tus respuestas en una corrida no son "ok", estás siendo demasiado estricto — revisa de nuevo.
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
  try {
    rows = await loadConceptos(rfc, dateFrom, dateTo);
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
    const prompt = buildPrompt(toon, periodoLabel, rfc);

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

  return NextResponse.json({
    ok: true,
    rfc,
    periodo: periodoLabel,
    totalRevisados: results.length,
    resumen,
    items: results,
  });
}
