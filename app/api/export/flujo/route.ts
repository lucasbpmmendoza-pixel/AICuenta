import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchflujo, fetchNombreEmpresa } from "@/lib/facturas-query";

// ─── Style helpers ─────────────────────────────────────────────────────────────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}
function addBorder(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const HEADER_BG = "595959";
const DATE_FMT  = "dd/mm/yyyy";
const MXN_FMT   = '"$"#,##0.00';
const TC_FMT    = "#,##0.0000";

const EP_HEADERS = [
  "Fuente", "Fecha Emisión", "Fecha Pago",
  "RFC Emisor", "Razón Social Emisor",
  "RFC Receptor", "Razón Social Receptor",
  "Forma Pago", "Moneda", "Tipo Cambio",
  "Subtotal", "IVA", "Ret. ISR", "Ret. IVA", "Total",
];

const COL_WIDTHS = [15, 13, 13, 17, 30, 17, 30, 13, 10, 12, 14, 14, 13, 13, 14];
const COL_COUNT  = EP_HEADERS.length;

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
    dateTo   = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
  } else {
    if (isNaN(year)) return new Response("Parámetros inválidos", { status: 400 });
    if (quarterP !== null) {
      const q = parseInt(quarterP, 10);
      if (isNaN(q) || q < 1 || q > 4) return new Response("quarter inválido", { status: 400 });
      dateFrom = new Date(year, (q - 1) * 3, 1);
      dateTo   = new Date(year, q * 3, 1);
    } else if (monthP !== null) {
      const month = parseInt(monthP, 10);
      if (isNaN(month) || month < 1 || month > 12) return new Response("month inválido", { status: 400 });
      dateFrom = new Date(year, month - 1, 1);
      dateTo   = new Date(year, month, 1);
    } else {
      dateFrom = new Date(year, 0, 1);
      dateTo   = new Date(year + 1, 0, 1);
    }
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc))) {
    return new Response("RFC no encontrado", { status: 403 });
  }

  try {
    const [rows, nombreEmpresa] = await Promise.all([
      fetchflujo(rfc, dateFrom, dateTo),
      fetchNombreEmpresa(rfc),
    ]);

    // ─── Build workbook ────────────────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("EFECTIVAMENTE PAGADO");

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
    const thRow = ws.addRow(EP_HEADERS);
    thRow.font = { bold: true };
    thRow.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // Data rows
    for (const row of rows) {
      const tc = Number(row.tipoCambio) || 1;
      const isPago = row.fuente === "Complemento P";
      const dr = ws.addRow([
        row.fuente,                                           //  1 Fuente
        row.fechaEmision,                                     //  2 Fecha Emisión
        row.fechaPago ?? null,                                //  3 Fecha Pago
        row.RFC_emisor,                                       //  4 RFC Emisor
        row.RazonSocialEmisor || row.RFC_emisor,              //  5 Razón Social Emisor
        row.RFC_receptor,                                     //  6 RFC Receptor
        row.RazonSocialReceptor || row.RFC_receptor,          //  7 Razón Social Receptor
        row.formaPago || "",                                  //  8 Forma Pago
        row.moneda,                                           //  9 Moneda
        tc,                                                   // 10 Tipo Cambio
        Number(row.subtotal) * tc,                            // 11 Subtotal
        Number(row.iva)      * tc,                            // 12 IVA
        Number(row.retISR)   * tc,                            // 13 Ret. ISR
        Number(row.retIVA)   * tc,                            // 14 Ret. IVA
        Number(row.total) * tc,                               // 15 Total
      ]);

      dr.getCell(2).numFmt = DATE_FMT;
      if (!isPago) dr.getCell(3).numFmt = DATE_FMT;
      dr.getCell(10).numFmt = TC_FMT;

      dr.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        if (ci >= 11 && ci <= 15) cell.numFmt = MXN_FMT;
      });
    }

    // Totals row
    const tc = (r: typeof rows[number]) => Number(r.tipoCambio) || 1;
    const totSubtotal = rows.reduce((s, r) => s + Number(r.subtotal) * tc(r), 0);
    const totIva      = rows.reduce((s, r) => s + Number(r.iva)      * tc(r), 0);
    const totRetISR   = rows.reduce((s, r) => s + Number(r.retISR)   * tc(r), 0);
    const totRetIVA   = rows.reduce((s, r) => s + Number(r.retIVA)   * tc(r), 0);
    const totTotal    = rows.reduce((s, r) => s + Number(r.total)    * tc(r), 0);

    const totRow = ws.addRow([
      "TOTALES", null, null, null, null, null, null, null, null, null,
      totSubtotal, totIva, totRetISR, totRetIVA, totTotal,
    ]);
    totRow.font = { bold: true };
    totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell);
      setFill(cell, HEADER_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      if (ci >= 11 && ci <= 15) cell.numFmt = MXN_FMT;
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
    const fileName = `Flujo_${rfc}_${periodLabel}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("[export/Flujo]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
