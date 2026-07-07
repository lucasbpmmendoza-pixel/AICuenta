import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchRetencionesIEPSData, fetchNombreEmpresa, type RetencionIEPSRow } from "@/lib/facturas-query";
import { getDemoNombreEmpresa } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";
import { consumeDemoDownloadSlot, formatRetryAfter } from "@/lib/demo-download-limit";
import { rfcDisplay } from "@/lib/rfc-aliases";

// ─── Style helpers ────────────────────────────────────────────────────────────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}
function addBorder(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEADER_BG = "595959"; // GRIS
const DATE_FMT  = "dd/mm/yyyy";
const MXN_FMT   = '"$"#,##0.00';
const TC_FMT    = "#,##0.0000";

const HEADERS = [
  "Fecha", "Folio", "Dirección", "Tipo Comprobante",
  "RFC Emisor", "Razón Social Emisor", "Régimen Emisor",
  "RFC Receptor", "Razón Social Receptor", "Régimen Receptor",
  "Subtotal", "IEPS Trasladado", "IEPS Retenido", "Total",
  "Moneda", "Tipo Cambio", "Forma Pago", "Método Pago", "Uso CFDI",
];
const COL_WIDTHS = [13, 38, 12, 15, 16, 30, 14, 16, 30, 14, 14, 16, 16, 14, 10, 12, 12, 13, 12];
const COL_COUNT  = HEADERS.length;

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0; }

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("uid", userId).input("rfc", rfc)
    .query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc");
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc       = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year      = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP    = searchParams.get("month");
  const quarterP  = searchParams.get("quarter");
  const dateFromP = searchParams.get("dateFrom");
  const dateToP   = searchParams.get("dateTo");

  if (!rfc) return new Response("rfc requerido", { status: 400 });

  let dateFrom: Date;
  let dateTo: Date;

  if (dateFromP && dateToP) {
    const df = new Date(dateFromP);
    const dt = new Date(dateToP);
    if (isNaN(df.getTime()) || isNaN(dt.getTime())) return new Response("fechas inválidas", { status: 400 });
    dateFrom = df;
    dateTo   = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
  } else {
    if (isNaN(year)) return new Response("Parámetros inválidos", { status: 400 });
    if (quarterP !== null) {
      const q = parseInt(quarterP, 10);
      if (isNaN(q) || q < 1 || q > 4) return new Response("quarter inválido", { status: 400 });
      dateFrom = new Date(Date.UTC(year, (q - 1) * 3, 1));
      dateTo   = new Date(Date.UTC(year, q * 3, 1));
    } else if (monthP !== null) {
      const month = parseInt(monthP, 10);
      if (isNaN(month) || month < 1 || month > 12) return new Response("month inválido", { status: 400 });
      dateFrom = new Date(Date.UTC(year, month - 1, 1));
      dateTo   = new Date(Date.UTC(year, month, 1));
    } else {
      dateFrom = new Date(Date.UTC(year, 0, 1));
      dateTo   = new Date(Date.UTC(year + 1, 0, 1));
    }
  }

  const demoMode = isDemoSession(session);
  if (!demoMode && (await isFreemiumOwner(session))) {
    return new Response(FREEMIUM_FORBIDDEN_MESSAGE, { status: 403 });
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
    const [rows, nombreEmpresa] = demoMode
      ? [[] as RetencionIEPSRow[], getDemoNombreEmpresa(rfc)]
      : await Promise.all([
          fetchRetencionesIEPSData(rfc, dateFrom, dateTo),
          fetchNombreEmpresa(rfc),
        ]);

    // ─── Build workbook ──────────────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    wb.creator = "AIcuenta";
    wb.created = new Date();
    const ws = wb.addWorksheet("RETENCIONES IEPS");

    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Company header
    const hRow = ws.addRow([nombreEmpresa]);
    hRow.height = 20;
    const hCell = hRow.getCell(1);
    hCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    setFill(hCell, HEADER_BG);
    hCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    addBorder(hCell);
    ws.mergeCells(hRow.number, 1, hRow.number, COL_COUNT);

    // Blank row
    ws.addRow([]);

    // Table headers
    const thRow = ws.addRow(HEADERS);
    thRow.font = { bold: true };
    thRow.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // Data rows — moneda extranjera se convierte a MXN con tipoCambio
    let sumSubtotal = 0;
    let sumIepsTrasladado = 0;
    let sumIepsRetenido = 0;
    let sumTotal = 0;

    for (const row of rows) {
      const tc = n(row.tipoCambio) || 1;
      const subtotal        = n(row.Subtotal) * tc;
      const iepsTrasladado  = n(row.TotalTrasladadoIEPS) * tc;
      const iepsRetenido    = n(row.TotalRetenidoIEPS) * tc;
      const total           = n(row.Total) * tc;

      sumSubtotal       += subtotal;
      sumIepsTrasladado += iepsTrasladado;
      sumIepsRetenido   += iepsRetenido;
      sumTotal          += total;

      const dr = ws.addRow([
        row.Fecha,                             //  1 Fecha
        row.UUID,                              //  2 Folio (UUID)
        row.Direccion,                         //  3 Dirección
        row.TipoComprobante,                   //  4 Tipo Comprobante
        rfcDisplay(row.RFC_Emisor),            //  5 RFC Emisor
        row.RazonSocialEmisor,                 //  6 Razón Social Emisor
        row.RegimenFiscal,                     //  7 Régimen Emisor
        rfcDisplay(row.RFC_Receptor),          //  8 RFC Receptor
        row.RazonSocialReceptor,               //  9 Razón Social Receptor
        row.RegimenFiscalReceptor,             // 10 Régimen Receptor
        subtotal,                              // 11 Subtotal
        iepsTrasladado,                        // 12 IEPS Trasladado
        iepsRetenido,                          // 13 IEPS Retenido
        total,                                 // 14 Total
        row.Moneda,                            // 15 Moneda
        tc,                                    // 16 Tipo Cambio
        row.TipoPago,                          // 17 Forma Pago
        row.MetodoPago,                        // 18 Método Pago
        row.UsoCFDI,                           // 19 Uso CFDI
      ]);

      dr.getCell(1).numFmt = DATE_FMT;
      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        if (ci >= 11 && ci <= 14) cell.numFmt = MXN_FMT;
        if (ci === 16)            cell.numFmt = TC_FMT;
      });
    }

    // Totals row
    const totRow = ws.addRow([
      "TOTALES", null, null, null, null, null, null, null, null, null,
      sumSubtotal, sumIepsTrasladado, sumIepsRetenido, sumTotal,
      null, null, null, null, null,
    ]);
    totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell);
      setFill(cell, HEADER_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      if (ci >= 11 && ci <= 14) cell.numFmt = MXN_FMT;
    });

    const buf = await wb.xlsx.writeBuffer();
    const pad = (v: number) => String(v).padStart(2, "0");
    const periodLabel = dateFromP && dateToP
      ? `${dateFromP}_${dateToP}`
      : quarterP !== null
        ? `Q${parseInt(quarterP, 10)}-${year}`
        : monthP !== null
          ? `${pad(parseInt(monthP, 10))}-${year}`
          : String(year);
    const fileName = `retenciones-ieps_${rfc}_${periodLabel}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
      },
    });
  } catch (err) {
    console.error("[export/retenciones-ieps]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
