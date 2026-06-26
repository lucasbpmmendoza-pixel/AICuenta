import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchNotasCreditoData, fetchNombreEmpresa } from "@/lib/facturas-query";
import { buildDemoNotasCredito, getDemoNombreEmpresa } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";
import { consumeDemoDownloadSlot, formatRetryAfter } from "@/lib/demo-download-limit";
import { rfcDisplay } from "@/lib/rfc-aliases";

// ─── Style helpers (match variablesEstaticas.js / variablesEspecificas.js) ────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}
function addBorder(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const HEADER_BG = "595959"; // GRIS — matches escribirEncabezadoRfc
const DATE_FMT  = "dd/mm/yyyy";
const MXN_FMT   = '"$"#,##0.00';
const TC_FMT    = "#,##0.0000";

// Headers match writeTableHeadersNotasCredito() in variablesEspecificas.js
const NC_HEADERS = [
  "Fecha", "Folio", "Emisor", "Régimen Emisor", "Receptor", "Régimen Receptor",
  "Subtotal", "IVA 8%", "IVA 16%", "Total Trasladados",
  "Retención ISR", "Retención IVA", "Total Retenidos", "Descuento", "Total",
  "Forma Pago", "Moneda", "Tipo Cambio", "Tipo Comprobante", "Método Pago",
];

// Column widths match ajustarAnchoColumnasNotasCredito() in variablesEspecificas.js
const COL_WIDTHS = [13, 38, 17, 17, 17, 17, 14, 13, 13, 16, 14, 14, 15, 13, 14, 12, 10, 12, 17, 13];
const COL_COUNT  = NC_HEADERS.length;

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("uid", userId).input("rfc", rfc)
    .query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc");
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

// ─── GET ───────────────────────────────────────────────────────────────────────

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
        `Limite demo alcanzado: 6 descargas cada 15 minutos. Intenta en ${formatRetryAfter(demoDownloadLimit.retryAfterSeconds)}.`,
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
      ? [buildDemoNotasCredito(rfc, dateFrom, dateTo), getDemoNombreEmpresa(rfc)]
      : await Promise.all([
          fetchNotasCreditoData(rfc, dateFrom, dateTo),
          fetchNombreEmpresa(rfc),
        ]);

    // ─── Build workbook ────────────────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("NOTAS CREDITO");

    // Column widths (ajustarAnchoColumnasNotasCredito)
    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Company header (escribirEncabezadoRfc — GRIS bg, height 20,  bold, centered, bordered)
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

    // Table headers (writeTableHeadersNotasCredito — bold, centered, bordered, no fill)
    const thRow = ws.addRow(NC_HEADERS);
    thRow.font = { bold: true };
    thRow.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // Data rows
    for (const row of rows) {
      const tc = Number(row.tipoCambio) || 1;
      const dr = ws.addRow([
        row.fecha,                              // 1  Fecha
        row.uuid,                               // 2  Folio (UUID)
        rfcDisplay(row.RFC_emisor),              // 3  Emisor
        row.RegimenFiscal,                      // 4  Régimen Emisor
        rfcDisplay(row.RFC_receptor),           // 5  Receptor
        row.RegimenFiscalReceptor,              // 6  Régimen Receptor
        Number(row.subtotal)       * tc,        // 7  Subtotal
        Number(row.iva8)           * tc,        // 8  IVA 8%
        Number(row.iva16)          * tc,        // 9  IVA 16%
        Number(row.totaltrasladados) * tc,      // 10 Total Trasladados
        Number(row.retISR)         * tc,        // 11 Retención ISR
        Number(row.retIVA)         * tc,        // 12 Retención IVA
        Number(row.totalretenidos) * tc,        // 13 Total Retenidos
        Number(row.descuento)      * tc,        // 14 Descuento
        Number(row.total)          * tc,        // 15 Total
        row.TipoPago,                           // 16 Forma Pago
        row.Moneda,                             // 17 Moneda
        tc,                                     // 18 Tipo Cambio
        row.TipoComprobante,                    // 19 Tipo Comprobante
        row.MetodoPago,                         // 20 Método Pago
      ]);

      // Date format col 1
      dr.getCell(1).numFmt = DATE_FMT;

      // Money cols 7–15, TC col 18, borders all
      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        if (ci >= 7 && ci <= 15) cell.numFmt = MXN_FMT;
        if (ci === 18)           cell.numFmt = TC_FMT;
      });
    }

    // Totals row — cols 7–15 (all already in MXN: each row × its own tc)
    const sum = (fn: (r: typeof rows[0]) => number) =>
      rows.reduce((s, r) => s + fn(r), 0);
    const totRow = ws.addRow([
      "TOTALES",  // 1
      null,        // 2  Folio
      null,        // 3  Emisor
      null,        // 4  Régimen Emisor
      null,        // 5  Receptor
      null,        // 6  Régimen Receptor
      sum(r => Number(r.subtotal)         * (Number(r.tipoCambio) || 1)), //  7 Subtotal
      sum(r => Number(r.iva8)             * (Number(r.tipoCambio) || 1)), //  8 IVA 8%
      sum(r => Number(r.iva16)            * (Number(r.tipoCambio) || 1)), //  9 IVA 16%
      sum(r => Number(r.totaltrasladados) * (Number(r.tipoCambio) || 1)), // 10 Total Trasl.
      sum(r => Number(r.retISR)           * (Number(r.tipoCambio) || 1)), // 11 Ret. ISR
      sum(r => Number(r.retIVA)           * (Number(r.tipoCambio) || 1)), // 12 Ret. IVA
      sum(r => Number(r.totalretenidos)   * (Number(r.tipoCambio) || 1)), // 13 Total Ret.
      sum(r => Number(r.descuento)        * (Number(r.tipoCambio) || 1)), // 14 Descuento
      sum(r => Number(r.total)            * (Number(r.tipoCambio) || 1)), // 15 Total
      null,        // 16 Forma Pago
      null,        // 17 Moneda
      null,        // 18 Tipo Cambio
      null,        // 19 Tipo Comprobante
      null,        // 20 Método Pago
    ]);
    totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell);
      setFill(cell, HEADER_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      if (ci >= 7 && ci <= 15) cell.numFmt = MXN_FMT;
    });

    const buf = await wb.xlsx.writeBuffer();
    const pad = (n: number) => String(n).padStart(2, "0");
    const periodLabel = dateFromP && dateToP
      ? `${dateFromP}_${dateToP}`
      : quarterP !== null
        ? `Q${parseInt(quarterP, 10)}-${year}`
        : monthP !== null
          ? `${pad(parseInt(monthP, 10))}-${year}`
          : String(year);
    const fileName = `notas-credito_${rfc}_${periodLabel}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
      },
    });
  } catch (err) {
    console.error("[export/notas-credito]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
