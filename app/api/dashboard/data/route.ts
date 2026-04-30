import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc   = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const effectiveUserId = session.ownerId ?? session.sub;

  const owns = await validateRfc(effectiveUserId, rfc);
  if (!owns) return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });

  const dateFrom = new Date(year, month - 1, 1)
  const dateTo   = new Date(year, month, 1)

  try {
    const db = await getDb();

    // 2 batches en paralelo — cada uno envía múltiples SELECT en un solo round-trip
    const [cfdiBatch, concBatch] = await Promise.all([

      // Batch 1: resúmenes + top contrapartes sobre facturalo_cfdis (4 result sets)
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          -- tc: tipo de cambio a MXN; 1 cuando Moneda=MXN o sin valor
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
            AND Fecha>=@dateFrom AND Fecha<@dateTo;

          SELECT
            ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total * ISNULL(NULLIF(tipoCambio,0),1) ELSE 0 END),0) AS total,
            COUNT(*) AS count
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
            AND Fecha>=@dateFrom AND Fecha<@dateTo;

          SELECT TOP 5
            LEFT(ISNULL(NULLIF(RazonSocialReceptor,''), RFC_Receptor), 28) AS nombre,
            SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) AS monto
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='I' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          GROUP BY RazonSocialReceptor, RFC_Receptor
          ORDER BY SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) DESC;

          SELECT TOP 5
            LEFT(ISNULL(NULLIF(RazonSocialEmisor,''), RFC_Emisor), 28) AS nombre,
            SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) AS monto
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='I' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          GROUP BY RazonSocialEmisor, RFC_Emisor
          ORDER BY SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) DESC;
        `),

      // Batch 2: top conceptos — usa rfc_cliente (=RFC_Emisor) en facturalo_conceptos.
      // Para egresos (receptor), no hay rfc_cliente del receptor en conceptos,
      // así que usamos facturalo_cfdis directamente filtrando por Movimiento.
      db.request()
        .input("rfc",      sql.NVarChar, rfc)
        .input("dateFrom", sql.DateTime,  dateFrom)
        .input("dateTo",   sql.DateTime,  dateTo)
        .query(`
          -- conceptos ingresos: JOIN a cfdis para obtener tipoCambio (CIX_cfdis_UUID hace el lookup eficiente)
          SELECT TOP 5
            LEFT(ISNULL(c.Descripcion,'Sin descripción'), 28) AS concepto,
            SUM(c.Importe * ISNULL(NULLIF(f.tipoCambio,0),1)) AS monto
          FROM facturalo_conceptos c WITH (NOLOCK)
          JOIN facturalo_cfdis f WITH (NOLOCK) ON c.UUID = f.UUID
          WHERE c.rfc_cliente=@rfc AND LOWER(c.movimiento)='ingreso'
            AND c.fecha>=@dateFrom AND c.fecha<@dateTo
          GROUP BY c.Descripcion
          ORDER BY SUM(c.Importe * ISNULL(NULLIF(f.tipoCambio,0),1)) DESC;

          SELECT TOP 5
            LEFT(ISNULL(NULLIF(RazonSocialEmisor,''), RFC_Emisor), 28) AS concepto,
            SUM(Total * ISNULL(NULLIF(tipoCambio,0),1)) AS monto
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='I' AND Status='Vigente'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          GROUP BY RazonSocialEmisor, RFC_Emisor
          ORDER BY SUM(Total) DESC;
        `),
    ]);

    // recordsets type cast for numeric indexing
    const cfdi = cfdiBatch.recordsets as unknown as unknown[][];
    const conc = concBatch.recordsets  as unknown as unknown[][];

    type IngRow  = { total:number; count:number; vigentes:number; cancelados:number; ivaTotal:number; isrRetenido:number; ivaRetenido:number };
    type EgrRow  = { total:number; count:number };
    type NomRow  = { nombre:string; monto:number };
    type ConcRow = { concepto:string; monto:number };

    const ingRow   = ((cfdi[0] as IngRow[])[0])  ?? { total:0, count:0, vigentes:0, cancelados:0, ivaTotal:0, isrRetenido:0, ivaRetenido:0 };
    const egrRow   = ((cfdi[1] as EgrRow[])[0])  ?? { total:0, count:0 };
    const clientes = cfdi[2] as NomRow[];
    const provs    = cfdi[3] as NomRow[];
    const concIng  = conc[0] as ConcRow[];
    const concEgr  = conc[1] as ConcRow[];

    return NextResponse.json({
      ingresos: {
        total:       Number(ingRow.total),
        count:       Number(ingRow.count),
        vigentes:    Number(ingRow.vigentes),
        cancelados:  Number(ingRow.cancelados),
        ivaTotal:    Number(ingRow.ivaTotal),
        isrRetenido: Number(ingRow.isrRetenido),
        ivaRetenido: Number(ingRow.ivaRetenido),
      },
      egresos: {
        total: Number(egrRow.total),
        count: Number(egrRow.count),
      },
      topClientes:          clientes.map(r => ({ nombre: r.nombre,     monto: Number(r.monto) })),
      topProveedores:       provs.map(r    => ({ nombre: r.nombre,     monto: Number(r.monto) })),
      topConceptosIngresos: concIng.map(r  => ({ concepto: r.concepto, monto: Number(r.monto) })),
      topConceptosEgresos:  concEgr.map(r  => ({ concepto: r.concepto, monto: Number(r.monto) })),
    });
  } catch (err) {
    console.error("[dashboard/data] Error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 503 });
  }
}
