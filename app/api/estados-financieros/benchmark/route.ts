import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb, getDbLong } from "@/lib/db";
import { fetchEstadosFinancieros } from "@/lib/facturas-query";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner } from "@/lib/freemium";
import { currentPeriod, hasComparAudUnlock } from "@/lib/one-time-purchases";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BENCH_MODEL = process.env.BENCHMARK_MODEL ?? "gpt-4o-mini";

interface CedulaInfo {
  razonSocial: string | null;
  nombre: string | null;
  tipoPersona: string | null;
  actividadesEconomicas: Array<{ actividad?: string; porcentaje?: string }>;
  regimenes: Array<{ regimen?: string }>;
}

interface PeriodoTotales {
  ingresosTotal: number;
  egresosTotal: number;
  nominaTotal: number;
}

interface ConceptoLite {
  descripcion: string;
  claveProdServ: string;
  importe: number;
}

interface BenchmarkCategoria {
  nombre: string;
  estandar_pct: number;
  real_pct: number;
  real_monto: number;
  comentario: string;
}

interface BenchmarkResponse {
  industria: string;
  resumen: string;
  alertas: string[];
  recomendaciones: string[];
  categorias: BenchmarkCategoria[];
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
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

async function loadCedula(rfc: string): Promise<CedulaInfo | null> {
  const db = await getDb();
  const r = await db
    .request()
    .input("rfc", rfc)
    .query<{
      razon_social: string | null;
      nombre: string | null;
      tipo_persona: string | null;
      actividades_economicas: string | null;
      regimenes: string | null;
    }>(`
      SELECT TOP 1
        razon_social, nombre, tipo_persona,
        actividades_economicas, regimenes
      FROM cedulas_fiscales WITH (NOLOCK)
      WHERE rfc = @rfc AND activo = 1
      ORDER BY id DESC
    `);
  const row = r.recordset[0];
  if (!row) return null;
  return {
    razonSocial: row.razon_social,
    nombre: row.nombre,
    tipoPersona: row.tipo_persona,
    actividadesEconomicas: safeJsonParse(row.actividades_economicas, [] as CedulaInfo["actividadesEconomicas"]),
    regimenes: safeJsonParse(row.regimenes, [] as CedulaInfo["regimenes"]),
  };
}

async function loadTotalesPeriodo(rfc: string, dateFrom: Date, dateTo: Date): Promise<PeriodoTotales> {
  const db = await getDbLong();
  const TC = "ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), tipoCambio), 0), 1)";
  const r = await db
    .request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .query<{ ingresosTotal: number; egresosTotal: number; nominaTotal: number }>(`
      SELECT
        ISNULL(SUM(CASE
          WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE'
          THEN ISNULL(Total, 0) * ${TC} END), 0) AS ingresosTotal,
        ISNULL(SUM(CASE
          WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE'
          THEN ISNULL(Total, 0) * ${TC} END), 0) AS egresosTotal,
        ISNULL(SUM(CASE
          WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N' AND UPPER(Status)='VIGENTE'
          THEN ISNULL(Total, 0) * ${TC} END), 0) AS nominaTotal
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND Fecha >= @dateFrom AND Fecha < @dateTo
    `);
  const row = r.recordset[0] ?? { ingresosTotal: 0, egresosTotal: 0, nominaTotal: 0 };
  return {
    ingresosTotal: Number(row.ingresosTotal ?? 0),
    egresosTotal: Number(row.egresosTotal ?? 0),
    nominaTotal: Number(row.nominaTotal ?? 0),
  };
}

function buildPrompt(args: {
  rfc: string;
  periodo: string;
  cedula: CedulaInfo;
  totales: PeriodoTotales;
  egresos: ConceptoLite[];
}): string {
  const { rfc, periodo, cedula, totales, egresos } = args;
  const actividades = cedula.actividadesEconomicas
    .map((a) => `- ${a.actividad ?? ""}${a.porcentaje ? ` (${a.porcentaje})` : ""}`)
    .filter((s) => s.trim() !== "-")
    .join("\n") || "(no especificadas en cédula)";

  const regimenes = cedula.regimenes
    .map((r) => `- ${r.regimen ?? ""}`)
    .filter((s) => s.trim() !== "-")
    .join("\n") || "(no especificados)";

  const egresosLines = egresos
    .slice(0, 25)
    .map((e, i) => `${i + 1}. ${e.descripcion} | clave SAT: ${e.claveProdServ || "N/D"} | $${e.importe.toFixed(2)}`)
    .join("\n") || "(sin egresos categorizables en el periodo)";

  return `Eres un analista financiero experto en empresas mexicanas. Compara los gastos de la empresa contra el estándar de mercado de su industria.

DATOS DE LA EMPRESA (de la cédula fiscal):
- RFC: ${rfc}
- Razón social / nombre: ${cedula.razonSocial ?? cedula.nombre ?? "N/D"}
- Tipo de persona: ${cedula.tipoPersona ?? "N/D"}
- Actividades económicas:
${actividades}
- Regímenes fiscales:
${regimenes}

PERIODO ANALIZADO: ${periodo}

TOTALES DEL PERIODO (MXN, incluye IVA donde aplica):
- Ingresos totales: $${totales.ingresosTotal.toFixed(2)}
- Egresos totales (CFDI tipo Ingreso/Egreso recibidos): $${totales.egresosTotal.toFixed(2)}
- Nómina total (CFDI tipo N): $${totales.nominaTotal.toFixed(2)}

PRINCIPALES CONCEPTOS DE EGRESOS DEL PERIODO (top por importe, sin IVA):
${egresosLines}

TAREA:
1. Identifica la industria/sector específico de la empresa con base en sus actividades económicas (ej. "Desarrollo de software", "Restaurante", "Comercio al menudeo de ropa", etc.).
2. Define entre 3 y 6 categorías de GASTO típicas/relevantes para esa industria. Una de ellas SIEMPRE debe ser "Nómina" si la empresa tiene nómina (>0). El resto deben ser categorías estándar para esa industria (ej. para software: Publicidad/Marketing, Infraestructura/Tecnología, Servicios profesionales, Renta y oficinas; para restaurantes: Insumos/Materia prima, Renta, Publicidad, etc.).
3. Para cada categoría:
   - estandar_pct: porcentaje típico de mercado (0-100), de modo que la suma de los porcentajes ESTÁNDAR sume 100.
   - real_pct: porcentaje REAL de la empresa, basándote en la nómina total y en clasificar los principales conceptos de egresos en esa categoría. La suma de los real_pct debe sumar 100.
   - real_monto: monto absoluto en MXN que estimas corresponde a esa categoría en este periodo.
   - comentario: una frase corta explicando si está por arriba, por abajo o en línea con el estándar.
4. Genera 2-4 alertas concretas (gastos atípicos, faltantes, exceso de nómina, etc.).
5. Genera 2-4 recomendaciones accionables.
6. Genera un resumen de 1-2 oraciones.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto adicional) con la forma:
{
  "industria": "string",
  "resumen": "string",
  "alertas": ["string", ...],
  "recomendaciones": ["string", ...],
  "categorias": [
    { "nombre": "string", "estandar_pct": number, "real_pct": number, "real_monto": number, "comentario": "string" }
  ]
}

Reglas:
- Los porcentajes se expresan como números 0-100 (no fracciones).
- estandar_pct debe sumar 100 (puedes redondear).
- real_pct debe sumar 100 (puedes redondear).
- Si la nómina es 0 o muy baja, no fuerces la categoría "Nómina" y explícalo en el comentario.
- Sé conservador y honesto: si no hay datos suficientes (egresos vacíos), indícalo en el resumen y devuelve categorias=[] vacío.`;
}

function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function clampMonto(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  if (!isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeBenchmark(raw: unknown): BenchmarkResponse {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const categoriasRaw = Array.isArray(obj.categorias) ? obj.categorias : [];
  const categorias: BenchmarkCategoria[] = categoriasRaw.map((c) => {
    const it = (c ?? {}) as Record<string, unknown>;
    return {
      nombre: String(it.nombre ?? "").trim() || "Sin categoría",
      estandar_pct: clampPct(it.estandar_pct),
      real_pct: clampPct(it.real_pct),
      real_monto: clampMonto(it.real_monto),
      comentario: String(it.comentario ?? "").trim(),
    };
  });
  return {
    industria: String(obj.industria ?? "").trim() || "Industria no determinada",
    resumen: String(obj.resumen ?? "").trim(),
    alertas: Array.isArray(obj.alertas) ? obj.alertas.map((s) => String(s)).filter(Boolean) : [],
    recomendaciones: Array.isArray(obj.recomendaciones) ? obj.recomendaciones.map((s) => String(s)).filter(Boolean) : [],
    categorias,
  };
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
  const reqId = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json(
      { error: "El comparativo con IA no está disponible en modo demo." },
      { status: 403 },
    );
  }

  if (await isFreemiumOwner(session)) {
    return NextResponse.json(
      { error: "El comparativo está disponible solo en planes de pago." },
      { status: 403 },
    );
  }
  try {
    const db = await getDb();
    const cur = currentPeriod();
    const ok = await hasComparAudUnlock(db, session.sub, cur.year, cur.month);
    if (!ok) {
      return NextResponse.json(
        { error: "add_on_requerido", mensaje: "Desbloquea Comparar y Auditar por $100 MXN (mes calendario actual)." },
        { status: 402 },
      );
    }
  } catch {
    // fail-open: si la consulta falla no bloqueamos a un pagado
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

  const cedula = await loadCedula(rfc);
  if (!cedula) {
    return NextResponse.json(
      {
        error: "no_cedula",
        mensaje:
          "Aún no has cargado la cédula fiscal (constancia de situación fiscal) de este RFC. Cárgala desde la sección de Documentos para generar el comparativo.",
      },
      { status: 412 },
    );
  }

  const dateFrom = new Date(Date.UTC(year, month - 1, 1));
  const dateTo = new Date(Date.UTC(year, month, 1));
  const periodoLabel = `${String(month).padStart(2, "0")}/${year}`;

  let totales: PeriodoTotales;
  let egresosTop: ConceptoLite[];
  try {
    const [tot, ef] = await Promise.all([
      loadTotalesPeriodo(rfc, dateFrom, dateTo),
      fetchEstadosFinancieros(rfc, dateFrom, dateTo, 30),
    ]);
    totales = tot;
    egresosTop = (ef.egresos ?? []).map((e) => ({
      descripcion: e.descripcion ?? "",
      claveProdServ: e.claveProdServ ?? "",
      importe: Number(e.importe ?? 0),
    }));
  } catch (err) {
    console.error(`[benchmark][${reqId}] db_error:`, (err as Error).message);
    return NextResponse.json({ error: "Error al consultar datos financieros" }, { status: 503 });
  }

  if (totales.ingresosTotal === 0 && totales.egresosTotal === 0 && totales.nominaTotal === 0) {
    return NextResponse.json({
      ok: true,
      industria: "Sin datos suficientes",
      resumen: "No hay actividad fiscal en el periodo seleccionado para generar un comparativo.",
      alertas: [],
      recomendaciones: ["Selecciona un mes con actividad o carga más facturas para este RFC."],
      categorias: [],
      meta: {
        rfc,
        periodo: periodoLabel,
        totales,
        razonSocial: cedula.razonSocial ?? cedula.nombre,
      },
    });
  }

  const prompt = buildPrompt({ rfc, periodo: periodoLabel, cedula, totales, egresos: egresosTop });

  let parsed: BenchmarkResponse;
  try {
    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model: BENCH_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Eres un analista financiero experto en empresas mexicanas. Responde solo JSON." },
        { role: "user", content: prompt },
      ],
    });
    console.log(`[benchmark][${reqId}] openai_ms=${Date.now() - t0}`);
    const raw = completion.choices[0]?.message?.content?.toString() ?? "";
    if (!raw) throw new Error("Respuesta vacía del modelo");
    parsed = normalizeBenchmark(JSON.parse(cleanJson(raw)));
  } catch (err) {
    console.error(`[benchmark][${reqId}] openai_error:`, (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo generar el comparativo. Intenta de nuevo." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...parsed,
    meta: {
      rfc,
      periodo: periodoLabel,
      totales,
      razonSocial: cedula.razonSocial ?? cedula.nombre,
    },
  });
}
