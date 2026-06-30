import { NextRequest } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";
import { consumeDemoDownloadSlot, formatRetryAfter } from "@/lib/demo-download-limit";

type DiotRow = {
  rfcEmisor: string;
  baseIva8: number;
  iva8: number;
  baseIva16: number;
  iva16: number;
  baseIva0: number;
  baseIvaExento: number;
};

type DiotLineInput = {
  rfc: string;
  tipoTercero: string;
  base8: number;
  iva8: number;
  base16: number;
  iva16: number;
  base0: number;
  baseExento: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toSatInt(v: number): number {
  return Math.max(0, Math.round(n(v)));
}

function tipoTerceroByRfc(rfc: string): string {
  if (rfc === "XEXX010101000") return "05";
  if (rfc === "XAXX010101000") return "15";
  return "04";
}

function clampIva(base: number, iva: number, tasa: number): number {
  const maxCalc = Math.round(base * tasa);
  if (maxCalc < iva) return Math.max(0, iva - 1);
  return iva;
}

function buildDiotLine(line: DiotLineInput): string {
  return `${line.tipoTercero}|85|${line.rfc}|||||${line.base8 > 0 ? line.base8 : ""}||||${line.base16 > 0 ? line.base16 : ""}||||||${line.iva8 > 0 ? line.iva8 : ""}||||${line.iva16 > 0 ? line.iva16 : ""}||||||||||||||||||||||||||||${line.baseExento > 0 ? line.baseExento : ""}|${line.base0 > 0 ? line.base0 : ""}|||01`;
}

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db
    .request()
    .input("uid", userId)
    .input("rfc", rfc)
    .query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc"
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

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
    const effectiveUserId = session.ownerId ?? session.sub;
    if (!(await validateRfc(effectiveUserId, rfc))) {
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

    const lines: string[] = [];
    const details = rows.map((row) => {
      const base8 = toSatInt(row.baseIva8);
      const base16 = toSatInt(row.baseIva16);
      const base0 = toSatInt(row.baseIva0);
      const baseExento = toSatInt(row.baseIvaExento);
      const iva8 = clampIva(base8, toSatInt(row.iva8), 0.08);
      const iva16 = clampIva(base16, toSatInt(row.iva16), 0.16);

      const output: DiotLineInput = {
        rfc: (row.rfcEmisor ?? "").trim().toUpperCase(),
        tipoTercero: tipoTerceroByRfc((row.rfcEmisor ?? "").trim().toUpperCase()),
        base8,
        iva8,
        base16,
        iva16,
        base0,
        baseExento,
      };

      if (
        output.iva8 > 0 ||
        output.iva16 > 0 ||
        output.baseExento > 0 ||
        output.base0 > 0 ||
        output.base8 > 0 ||
        output.base16 > 0
      ) {
        lines.push(buildDiotLine(output));
      }

      return output;
    });

    const txt = lines.join("\n") + (lines.length > 0 ? "\n" : "");

    if (format === "json") {
      return Response.json(
        {
          rfc,
          period: period.label,
          rows: details,
          totalFilas: details.length,
          totalLineasTxt: lines.length,
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
