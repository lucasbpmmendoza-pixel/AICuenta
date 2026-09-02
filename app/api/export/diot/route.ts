import { NextRequest } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { validateRfcAccess } from "@/lib/rfc-access";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";
import { consumeDemoDownloadSlot, formatRetryAfter } from "@/lib/demo-download-limit";
import {
  type DiotCuadroRow,
  buildDiotTxt,
  generaLinea,
  n,
  toDiotLineInput,
} from "@/lib/diot-format";

type DiotRow = {
  rfcEmisor: string;
  baseIva8: number;
  iva8: number;
  baseIva16: number;
  iva16: number;
  baseIva0: number;
  baseIvaExento: number;
};

function parsePeriod(req: NextRequest): { dateFrom: Date; dateTo: Date; label: string } {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP = searchParams.get("month");
  const quarterP = searchParams.get("quarter");
  const dateFromP = searchParams.get("dateFrom");
  const dateToP = searchParams.get("dateTo");

  if (dateFromP && dateToP) {
    const df = new Date(dateFromP);
    const dt = new Date(dateToP);
    if (isNaN(df.getTime()) || isNaN(dt.getTime())) {
      throw new Error("fechas inválidas");
    }
    const nextDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
    return { dateFrom: df, dateTo: nextDay, label: `${dateFromP}_${dateToP}` };
  }

  if (isNaN(year)) throw new Error("year inválido");

  if (quarterP !== null) {
    const q = parseInt(quarterP, 10);
    if (isNaN(q) || q < 1 || q > 4) throw new Error("quarter inválido");
    return {
      dateFrom: new Date(Date.UTC(year, (q - 1) * 3, 1)),
      dateTo: new Date(Date.UTC(year, q * 3, 1)),
      label: `Q${q}-${year}`,
    };
  }

  if (monthP !== null) {
    const month = parseInt(monthP, 10);
    if (isNaN(month) || month < 1 || month > 12) throw new Error("month inválido");
    return {
      dateFrom: new Date(Date.UTC(year, month - 1, 1)),
      dateTo: new Date(Date.UTC(year, month, 1)),
      label: `${String(month).padStart(2, "0")}-${year}`,
    };
  }

  return {
    dateFrom: new Date(Date.UTC(year, 0, 1)),
    dateTo: new Date(Date.UTC(year + 1, 0, 1)),
    label: String(year),
  };
}

async function fetchDiotRows(rfc: string, dateFrom: Date, dateTo: Date): Promise<DiotRow[]> {
  const db = await getDb();
  const result = await db
    .request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .query<DiotRow>(`
      WITH base AS (
        SELECT
          RFC_Emisor AS rfcEmisor,
          CASE WHEN Moneda = 'USD' THEN ISNULL(BaseIVA8,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(BaseIVA8,0) END AS baseIva8,
          CASE WHEN Moneda = 'USD' THEN ISNULL(TotalTrasladadoIVAOcho,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(TotalTrasladadoIVAOcho,0) END AS iva8,
          CASE WHEN Moneda = 'USD' THEN ISNULL(BaseIVA16,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(BaseIVA16,0) END AS baseIva16,
          CASE WHEN Moneda = 'USD' THEN ISNULL(TotalTrasladadoIVADieciseis,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(TotalTrasladadoIVADieciseis,0) END AS iva16,
          CASE WHEN Moneda = 'USD' THEN ISNULL(BaseIVA0,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(BaseIVA0,0) END AS baseIva0,
          CASE WHEN Moneda = 'USD' THEN ISNULL(BaseIVAExento,0) * ISNULL(NULLIF(tipoCambio,0),1) ELSE ISNULL(BaseIVAExento,0) END AS baseIvaExento
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE UPPER(Movimiento) = 'EGRESO'
          AND TipoComprobante = 'I'
          AND UPPER(Status) = 'VIGENTE'
          AND rfc_cliente = @rfc
          AND Fecha >= @dateFrom
          AND Fecha < @dateTo
      )
      SELECT
        rfcEmisor,
        TRY_CONVERT(decimal(18,2), SUM(baseIva8))      AS baseIva8,
        TRY_CONVERT(decimal(18,2), SUM(iva8))          AS iva8,
        TRY_CONVERT(decimal(18,2), SUM(baseIva16))     AS baseIva16,
        TRY_CONVERT(decimal(18,2), SUM(iva16))         AS iva16,
        TRY_CONVERT(decimal(18,2), SUM(baseIva0))      AS baseIva0,
        TRY_CONVERT(decimal(18,2), SUM(baseIvaExento)) AS baseIvaExento
      FROM base
      GROUP BY rfcEmisor
      ORDER BY rfcEmisor
      OPTION (RECOMPILE, MAXDOP 1)
    `);

  return result.recordset;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });
  const demoMode = isDemoSession(session);
  if (!demoMode && (await isFreemiumOwner(session))) {
    return new Response(FREEMIUM_FORBIDDEN_MESSAGE, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rfc = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const format = (searchParams.get("format") ?? "txt").toLowerCase();

  if (!rfc) return new Response("rfc requerido", { status: 400 });

  let period: { dateFrom: Date; dateTo: Date; label: string };
  try {
    period = parsePeriod(req);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }

  if (!demoMode) {
    if (!(await validateRfcAccess(session, rfc))) {
      return new Response("RFC no encontrado", { status: 403 });
    }
  }

  let demoDownloadLimit: ReturnType<typeof consumeDemoDownloadSlot> | null = null;
  if (demoMode) {
    demoDownloadLimit = consumeDemoDownloadSlot(req);
    if (!demoDownloadLimit.allowed) {
      return new Response(
        `Límite demo alcanzado: 6 descargas cada 15 minutos. Intenta en ${formatRetryAfter(demoDownloadLimit.retryAfterSeconds)}.`,
        {
          status: 429,
          headers: {
            "Retry-After": String(demoDownloadLimit.retryAfterSeconds),
            "Set-Cookie": demoDownloadLimit.setCookie,
          },
        }
      );
    }
  }

  try {
    const rows = demoMode
      ? [
          { rfcEmisor: "AAA010101AAA", baseIva8: 12000, iva8: 960, baseIva16: 48000, iva16: 7680, baseIva0: 2500, baseIvaExento: 1000 },
          { rfcEmisor: "BBB010101BBB", baseIva8: 8600, iva8: 688, baseIva16: 22000, iva16: 3520, baseIva0: 1800, baseIvaExento: 700 },
          { rfcEmisor: "CCC010101CCC", baseIva8: 1400, iva8: 112, baseIva16: 9400, iva16: 1504, baseIva0: 300, baseIvaExento: 0 },
        ]
      : await fetchDiotRows(rfc, period.dateFrom, period.dateTo);

    // El cuadro conserva los decimales (es lo que ve el contador en el Excel);
    // el redondeo a entero solo ocurre al armar el TXT.
    const cuadro: DiotCuadroRow[] = rows.map((row) => ({
      rfc: (row.rfcEmisor ?? "").trim().toUpperCase(),
      base8: n(row.baseIva8),
      iva8: n(row.iva8),
      base16: n(row.baseIva16),
      iva16: n(row.iva16),
      base0: n(row.baseIva0),
      baseExento: n(row.baseIvaExento),
    }));

    const txt = buildDiotTxt(cuadro);

    if (format === "json") {
      return Response.json(
        {
          rfc,
          period: period.label,
          rows: cuadro,
          totalFilas: cuadro.length,
          totalLineasTxt: cuadro.map(toDiotLineInput).filter(generaLinea).length,
          previewTxt: txt.slice(0, 4000),
        },
        {
          headers: {
            ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
          },
        }
      );
    }

    const filename = `diot_${rfc}_${period.label}.txt`;
    return new Response(txt, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
        ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
      },
    });
  } catch (err) {
    console.error("[export/diot]", (err as Error).message);
    return new Response("Error al generar DIOT", { status: 503 });
  }
}
