import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchPagosData, fetchNombreEmpresa } from "@/lib/facturas-query";
import { buildDemoPagos, getDemoNombreEmpresa } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
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
const MXN       = '"$"#,##0.00';

// Headers match writeTableHeadersPagos() in variablesEspecificas.js
const PAGOS_HEADERS = [
  "Fecha Emision", "Fecha Pago", "UUID Pago", "RFC Emisor", "RFC Receptor",
  "Forma Pago", "Moneda Pago", "Tipo Cambio", "Total Pago",
  "UUID Documento", "Moneda Documento", "Num Parcialidad",
  "Saldo Anterior", "Importe Pagado", "Saldo Insoluto",
  "Base", "Tipo Factor", "Tasa o Cuota", "Importe Impuesto", "Objeto Impuesto",
];

// Column widths match ajustarAnchoColumnas() in variablesEspecificas.js
const COL_WIDTHS = [13, 13, 18, 17, 16, 13, 13, 13, 13, 18, 13, 13, 13, 13, 13, 10, 13, 15, 13, 13];
const COL_COUNT  = PAGOS_HEADERS.length;

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
      ? [buildDemoPagos(rfc, dateFrom, dateTo), getDemoNombreEmpresa(rfc)]
      : await Promise.all([
          fetchPagosData(rfc, dateFrom, dateTo),
          fetchNombreEmpresa(rfc),
        ]);

    // ─── Build workbook ────────────────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("PAGOS");

    // Column widths (ajustarAnchoColumnas)
    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Company header (escribirEncabezadoRfc — GRIS bg, height 20, white bold, centered, bordered)
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

    // Table headers (writeTableHeadersPagos — bold, centered, bordered, no fill)
    const thRow = ws.addRow(PAGOS_HEADERS);
    thRow.font = { bold: true };
    thRow.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // Data rows
    for (const row of rows) {
      const tc = Number(row.tipoCambio) || 1;
      const dr = ws.addRow([
        row.fechaEmision,                  // 1  Fecha Emision
        row.fechaPago,                     // 2  Fecha Pago
        row.uuid_pago,                     // 3  UUID Pago
        rfcDisplay(row.RFC_emisor),         // 4  RFC Emisor
        rfcDisplay(row.RFC_receptor),       // 5  RFC Receptor
        row.forma_pago,                    // 6  Forma Pago
        row.moneda_pago,                   // 7  Moneda Pago
        tc,                                // 8  Tipo Cambio
        Number(row.total_pago)   * tc,     // 9  Total Pago
        row.uuid_relacionado,              // 10 UUID Documento
        row.moneda_docto,                  // 11 Moneda Documento
        row.numParcialidad,                // 12 Num Parcialidad
        Number(row.saldo_anterior) * tc,   // 13 Saldo Anterior
        Number(row.saldo_pagado)   * tc,   // 14 Importe Pagado
        Number(row.saldo_insoluto) * tc,   // 15 Saldo Insoluto
        Number(row.base)           * tc,   // 16 Base
        row.tipo_factor,                   // 17 Tipo Factor
        row.tasa_o_cuota,                  // 18 Tasa o Cuota
        Number(row.importe)        * tc,   // 19 Importe Impuesto
        row.objetoImpuesto,                // 20 Objeto Impuesto
      ]);

      // Date format for cols 1 & 2
      dr.getCell(1).numFmt = DATE_FMT;
      dr.getCell(2).numFmt = DATE_FMT;

      // Money format and borders (cols 8-17 match original pagos.js: colIndex >= 8 && colIndex <= 17)
      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        if (ci >= 8 && ci <= 17) cell.numFmt = MXN;
      });
    }

    // Totals row — sum monetary columns
    const sum = (fn: (r: typeof rows[0]) => number) =>
      rows.reduce((s, r) => s + fn(r), 0);
    const tc1 = 1; // totals already in MXN (each row multiplied by its own tc)
    const totRow = ws.addRow([
      "TOTALES",      // 1
      null,           // 2  Fecha Pago
      null,           // 3  UUID Pago
      null,           // 4  RFC Emisor
      null,           // 5  RFC Receptor
      null,           // 6  Forma Pago
      null,           // 7  Moneda Pago
      null,           // 8  Tipo Cambio
      sum(r => Number(r.total_pago)     * (Number(r.tipoCambio) || 1)),   //  9 Total Pago
      null,           // 10 UUID Documento
      null,           // 11 Moneda Documento
      null,           // 12 Num Parcialidad
      sum(r => Number(r.saldo_anterior) * (Number(r.tipoCambio) || 1)),   // 13 Saldo Anterior
      sum(r => Number(r.saldo_pagado)   * (Number(r.tipoCambio) || 1)),   // 14 Importe Pagado
      sum(r => Number(r.saldo_insoluto) * (Number(r.tipoCambio) || 1)),   // 15 Saldo Insoluto
      sum(r => Number(r.base)           * (Number(r.tipoCambio) || 1)),   // 16 Base
      null,           // 17 Tipo Factor
      null,           // 18 Tasa o Cuota
      sum(r => Number(r.importe)        * (Number(r.tipoCambio) || 1)),   // 19 Importe Impuesto
      null,           // 20 Objeto Impuesto
    ]);
    totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell);
      setFill(cell, HEADER_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      if ([9, 13, 14, 15, 16, 19].includes(ci)) cell.numFmt = MXN;
    });

    // Stream response
    const buf = await wb.xlsx.writeBuffer();
    const pad = (n: number) => String(n).padStart(2, "0");
    const periodLabel = dateFromP && dateToP
      ? `${dateFromP}_${dateToP}`
      : quarterP !== null
        ? `Q${parseInt(quarterP, 10)}-${year}`
        : monthP !== null
          ? `${pad(parseInt(monthP, 10))}-${year}`
          : String(year);
    const fileName = `pagos_${rfc}_${periodLabel}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
      },
    });
  } catch (err) {
    console.error("[export/pagos]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
