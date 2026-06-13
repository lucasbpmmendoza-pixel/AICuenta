import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { buildDemoDashboardData } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";

type IsrRegimenOption = {
  code: string;
  name: string;
  rateHint: string;
};

type NominaDeduccionesParsed = {
  retISR: number;
  imss: number;
};

const ISR_REGIMENES: IsrRegimenOption[] = [
  { code: "601", name: "General de Ley Personas Morales", rateHint: "30%" },
  { code: "603", name: "Personas Morales con Fines no Lucrativos", rateHint: "0%" },
  { code: "605", name: "Sueldos y Salarios e Ingresos Asimilados", rateHint: "0%" },
  { code: "606", name: "Arrendamiento", rateHint: "20%" },
  { code: "608", name: "Demas ingresos", rateHint: "30%" },
  { code: "610", name: "Residentes en el Extranjero", rateHint: "30%" },
  { code: "611", name: "Ingresos por Dividendos", rateHint: "10%" },
  { code: "612", name: "Personas Fisicas con Actividades Empresariales y Profesionales", rateHint: "30%" },
  { code: "614", name: "Ingresos por intereses", rateHint: "10%" },
  { code: "615", name: "Regimen de los ingresos por obtencion de premios", rateHint: "10%" },
  { code: "616", name: "Sin obligaciones fiscales", rateHint: "0%" },
  { code: "620", name: "Sociedades Cooperativas de Produccion", rateHint: "30%" },
  { code: "621", name: "Incorporacion Fiscal", rateHint: "10%" },
  { code: "622", name: "Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras", rateHint: "21%" },
  { code: "623", name: "Opcional para Grupos de Sociedades", rateHint: "30%" },
  { code: "624", name: "Coordinados", rateHint: "30%" },
  { code: "625", name: "RESICO Personas Fisicas", rateHint: "1% a 2.5%" },
  { code: "626", name: "RESICO Personas Morales", rateHint: "1%" },
 ];

async function validateRfc(effectiveUserId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db
    .request()
    .input("user_id", effectiveUserId)
    .input("rfc", rfc)
    .query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id = @user_id AND rfc = @rfc"
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseNominaDeducciones(raw: unknown): NominaDeduccionesParsed {
  if (raw === null || raw === undefined || raw === "") return { retISR: 0, imss: 0 };

  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { retISR: 0, imss: 0 };
    }
  }

  const root = asObject(data);
  if (!root) return { retISR: 0, imss: 0 };

  const detalle = root.detalle;
  let retISR = 0;
  let imss = 0;

  if (Array.isArray(detalle)) {
    for (const item of detalle) {
      const row = asObject(item);
      if (!row) continue;
      const tipo = String(row.tipoDeduccion ?? row.TipoDeduccion ?? "").trim();
      const concepto = String(row.concepto ?? row.Concepto ?? "").toLowerCase();
      const importe = n(row.importe ?? row.Importe);
      if (importe <= 0) continue;

      if (tipo === "002" || concepto.includes("isr")) {
        retISR += importe;
        continue;
      }
      if (tipo === "001" || concepto.includes("imss") || concepto.includes("seguridad social")) {
        imss += importe;
      }
    }
  }

  const resumen = asObject(root.resumenPorTipo ?? root.ResumenPorTipo);
  if (retISR === 0 && resumen) retISR = n(resumen["002"]);
  if (imss === 0 && resumen) imss = n(resumen["001"]);

  const totalRet = n(root.totalImpuestosRetenidos ?? root.TotalImpuestosRetenidos ?? root.totalRetenidos ?? root.TotalRetenidos);
  if (retISR === 0 && totalRet > 0) retISR = totalRet;

  return { retISR, imss };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const demoMode = isDemoSession(session);

  const { searchParams } = new URL(req.url);
  const rfc   = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const dateFrom = new Date(Date.UTC(year, month - 1, 1))
  const dateTo   = new Date(Date.UTC(year, month, 1))

  if (demoMode) {
    return NextResponse.json(buildDemoDashboardData(rfc, dateFrom, dateTo));
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  const owns = await validateRfc(effectiveUserId, rfc);
  if (!owns) return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });

  try {
    const db = await getDb();

    const dedCols = await db.request().query<{ COLUMN_NAME: string }>(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'facturalo_cfdis'
        AND COLUMN_NAME IN ('NominaDeducciones', 'nomina_deducciones', 'nominaDeducciones')
    `);
    const nominaDedCol = dedCols.recordset[0]?.COLUMN_NAME ?? null;
    const nominaDedSelect = nominaDedCol
      ? `TRY_CONVERT(nvarchar(max), [${nominaDedCol.replace(/\]/g, "]]" )}]) AS NominaDeducciones`
      : `CAST(NULL AS nvarchar(max)) AS NominaDeducciones`;

    // Promise.allSettled — si una query es lenta/falla, las demás igual retornan
    const [ingRes, egrRes, clientesRes, provsRes, concIngRes, regimenRes, nominaRetRes, conteoRes] = await Promise.allSettled([

      // Q1: Resumen ingresos emitidos
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0)              AS total,
            COUNT(*)                                                                                                        AS count,
            SUM(CASE WHEN Status='Vigente'  THEN 1 ELSE 0 END)                                                            AS vigentes,
            SUM(CASE WHEN Status!='Vigente' THEN 1 ELSE 0 END)                                                            AS cancelados,
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN TotalTrasladadoIVA * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0) AS ivaTotal,
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN TotalRetenidoISR   * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0) AS isrRetenido,
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN TotalRetenidoIVA   * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0) AS ivaRetenido
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q2: Resumen egresos recibidos
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0) AS total,
            COUNT(*) AS count
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q3: Top 5 clientes (receptores de ingresos emitidos)
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT TOP 5
            LEFT(ISNULL(NULLIF(RazonSocialReceptor,''), RFC_Receptor), 28) AS nombre,
            SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) AS monto
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='I' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          GROUP BY RazonSocialReceptor, RFC_Receptor
          ORDER BY SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) DESC
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q4: Top 5 proveedores (emisores de egresos recibidos)
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT TOP 5
            LEFT(ISNULL(NULLIF(RazonSocialEmisor,''), RFC_Emisor), 28) AS nombre,
            SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) AS monto
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='I' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          GROUP BY RazonSocialEmisor, RFC_Emisor
          ORDER BY SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) DESC
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q5: Top 5 conceptos de ingresos
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT TOP 5
            LEFT(ISNULL(c.Descripcion,'Sin descripción'), 28) AS concepto,
            SUM(ISNULL(c.Importe,0)) AS monto
          FROM facturalo_conceptos c WITH (NOLOCK)
          WHERE c.rfc_cliente=@rfc AND c.movimiento='Ingreso'
            AND c.fecha>=@dateFrom AND c.fecha<@dateTo
          GROUP BY c.Descripcion
          ORDER BY SUM(ISNULL(c.Importe,0)) DESC
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q6: Régimen fiscal
      db.request()
        .input("rfc", sql.NVarChar, rfc)
        .query(`
          SELECT TOP 1 ISNULL(RegimenFiscal,'') AS regimenFiscal
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
            AND RegimenFiscal IS NOT NULL AND RegimenFiscal<>''
          ORDER BY Fecha DESC
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q7: Retenciones de nómina emitida (ISR + IMSS desde NominaDeducciones)
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          SELECT
            TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoISR,0))                    AS isrDB,
            ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), tipoCambio),0), 1)               AS tipoCambio,
            ${nominaDedSelect}
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='N' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          OPTION (RECOMPILE, MAXDOP 1)
        `),

      // Q8: Conteo total de CFDIs por RFC (tabla conteo_cfdi)
      db.request()
        .input("rfc", sql.NVarChar, rfc)
        .query(`
          SELECT TOP 1
            ISNULL(emitidos,  0) AS emitidos,
            ISNULL(recibidos, 0) AS recibidos,
            ISNULL(total,     0) AS total
          FROM conteo_cfdi WITH (NOLOCK)
          WHERE rfc = @rfc
          OPTION (RECOMPILE, MAXDOP 1)
        `),
    ]);

    type IngRow  = { total:number; count:number; vigentes:number; cancelados:number; ivaTotal:number; isrRetenido:number; ivaRetenido:number };
    type EgrRow  = { total:number; count:number };
    type NomRow  = { nombre:string; monto:number };
    type ConcRow = { concepto:string; monto:number };
    type NomRetRow = { isrDB: number; tipoCambio: number; NominaDeducciones: string | null };
    type ConteoRow = { emitidos: number; recibidos: number; total: number };

    // Helper: extrae recordset de un PromiseSettledResult, o retorna default
    function settled<T>(res: PromiseSettledResult<sql.IResult<T>>, def: T[]): T[] {
      if (res.status === 'fulfilled') return res.value.recordset as T[];
      console.error('[dashboard/data] query failed:', (res.reason as Error)?.message);
      return def;
    }
    function settledOne<T>(res: PromiseSettledResult<sql.IResult<T>>, def: T): T {
      if (res.status === 'fulfilled') return (res.value.recordset[0] as T) ?? def;
      console.error('[dashboard/data] query failed:', (res.reason as Error)?.message);
      return def;
    }

    const defIng: IngRow = { total:0, count:0, vigentes:0, cancelados:0, ivaTotal:0, isrRetenido:0, ivaRetenido:0 };
    const defEgr: EgrRow = { total:0, count:0 };

    const ingRow   = settledOne<IngRow>(ingRes,  defIng);
    const egrRow   = settledOne<EgrRow>(egrRes,  defEgr);
    const clientes = settled<NomRow>(clientesRes, []);
    const provs    = settled<NomRow>(provsRes,    []);
    const concIng  = settled<ConcRow>(concIngRes, []);
    const concEgr  = provs.map(p => ({ concepto: p.nombre, monto: p.monto }));
    const regRes   = regimenRes.status === 'fulfilled' ? regimenRes.value.recordset[0] : undefined;
    const nominaRows = settled<NomRetRow>(nominaRetRes, []);
    const conteoRow  = settledOne<ConteoRow>(conteoRes, { emitidos: 0, recibidos: 0, total: 0 });
    const regimen  = String((regRes as { regimenFiscal: string } | undefined)?.regimenFiscal ?? '').trim().replace(/\D/g, '').slice(0, 3);

    const ingresosMXN = Number(ingRow.total)       || 0;
    const egresosMXN  = Number(egrRow.total)       || 0;
    const utilidad    = Math.max(ingresosMXN - egresosMXN, 0);
    const isrRetenido = Number(ingRow.isrRetenido) || 0;

    let nominaIsr = 0;
    let nominaImss = 0;
    for (const r of nominaRows) {
      const tc = n(r.tipoCambio) || 1;
      const parsed = parseNominaDeducciones(r.NominaDeducciones);
      const isr = parsed.retISR > 0 ? parsed.retISR : n(r.isrDB);
      nominaIsr += isr * tc;
      nominaImss += parsed.imss * tc;
    }

    // Estima ISR provisional mensual según régimen fiscal
    function estimarISR(reg: string, ing: number, util: number, retenido: number): number {
      switch (reg) {
        // RESICO Personas Físicas — tasa progresiva sobre ingresos
        case '625':
          if (ing <= 25_000)  return ing * 0.0100;
          if (ing <= 50_000)  return ing * 0.0110;
          if (ing <= 83_333)  return ing * 0.0150;
          if (ing <= 208_333) return ing * 0.0200;
          return ing * 0.0250;
        // RESICO Personas Morales — 1 % sobre ingresos
        case '626':
          return ing * 0.01;
        // General Personas Morales — pago provisional ~30 % sobre ingresos
        // (Art. 14 LISR: ingresos acumulados × coeficiente utilidad × 30%;
        //  se usa 30% directo sobre ingresos como estimado conservador)
        case '601':
          return ing * 0.30;
        // PF Actividades Empresariales y Profesionales (incluye honorarios)
        // Retención en la fuente = 10 %; pago provisional propio = 30 % de ingresos
        case '612':
          return Math.max(ing * 0.30, retenido) || 0;
        // Arrendamiento — 20 % sobre ingresos (sin deducción)
        case '606':
          return ing * 0.20;
        // Incorporación Fiscal
        case '621':
          return ing * 0.10;
        default:
          // Sin régimen identificado: si hubo retenciones (honorarios, servicios)
          // se asume 10 %; de lo contrario 30 % de utilidad como respaldo conservador
          return (retenido > 0 ? Math.max(ing * 0.10, retenido) : ing * 0.30) || 0;
      }
    }

    function labelRegimen(reg: string): string {
      const match = ISR_REGIMENES.find((r) => r.code === reg);
      if (match) return `${match.name} · ${match.rateHint}`;
      return reg ? `Regimen ${reg}` : "Regimen no identificado";
    }

    return NextResponse.json({
      ingresos: {
        total:        ingresosMXN,
        count:        Number(ingRow.count)     || 0,
        vigentes:     Number(ingRow.vigentes)  || 0,
        cancelados:   Number(ingRow.cancelados) || 0,
        ivaTotal:     Number(ingRow.ivaTotal)  || 0,
        ivaRetenido:  Number(ingRow.ivaRetenido) || 0,
        isrRetenido:  isrRetenido,
        isrEstimado:  estimarISR(regimen, ingresosMXN, utilidad, isrRetenido),
        regimenFiscal: regimen,
        regimenLabel:  labelRegimen(regimen),
      },
      egresos: {
        total: Number(egrRow.total),
        count: Number(egrRow.count),
      },
      topClientes:          clientes.map(r => ({ nombre: r.nombre,     monto: Number(r.monto) })),
      topProveedores:       provs.map(r    => ({ nombre: r.nombre,     monto: Number(r.monto) })),
      topConceptosIngresos: concIng.map(r  => ({ concepto: r.concepto, monto: Number(r.monto) })),
      topConceptosEgresos:  concEgr.map(r  => ({ concepto: r.concepto, monto: Number(r.monto) })),
      nominaRetenciones: {
        count: nominaRows.length,
        isr: nominaIsr,
        imss: nominaImss,
      },
      conteoCfdi: {
        emitidos:  Number(conteoRow.emitidos)  || 0,
        recibidos: Number(conteoRow.recibidos) || 0,
        total:     Number(conteoRow.total)     || 0,
      },
      isrRegimenes: ISR_REGIMENES,
    });
  } catch (err) {
    console.error("[dashboard/data] Error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 503 });
  }
}
