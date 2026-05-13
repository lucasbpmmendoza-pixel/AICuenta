import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchEstadosFinancieros, fetchNombreEmpresa } from "@/lib/facturas-query";

// ─── Style helpers ─────────────────────────────────────────────────────────────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}
function addBorder(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const HEADER_BG   = "595959";
const ING_BG      = "1A6B3C"; // verde oscuro para ingresos
const EGR_BG      = "8B1A1A"; // rojo oscuro para egresos
const MXN_FMT     = '"$"#,##0.00';
const NUM_FMT     = "#,##0.00";

const HEADERS = ["Descripción", "Clave Prod/Serv", "# Facturas", "Cantidad", "Importe"];
const COL_WIDTHS = [55, 16, 12, 14, 18];

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("uid", userId).input("rfc", rfc)
    .query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc");
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

// ─── Sheet builder helper ──────────────────────────────────────────────────────

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  titleBg: string,
  title: string,
  subtitleLine: string,
  rows: { descripcion: string; claveProdServ: string; cantidad: number; importe: number; numFacturas: number }[]
) {
  const ws = wb.addWorksheet(sheetName);

  // Column widths + default numFmt (avoids per-cell formatting in data loop)
  ws.columns = [
    { width: COL_WIDTHS[0] },                         // 1 Descripción
    { width: COL_WIDTHS[1] },                         // 2 Clave
    { width: COL_WIDTHS[2] },                         // 3 # Facturas
    { width: COL_WIDTHS[3], style: { numFmt: NUM_FMT } }, // 4 Cantidad
    { width: COL_WIDTHS[4], style: { numFmt: MXN_FMT } }, // 5 Importe
  ];

  // Title row (merged, styled)
  ws.mergeCells(1, 1, 1, 5);
  const titleRow = ws.getRow(1);
  titleRow.height = 22;
  const titleCell = titleRow.getCell(1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  setFill(titleCell, titleBg);

  // Subtitle row (merged, styled)
  ws.mergeCells(2, 1, 2, 5);
  const subRow = ws.getRow(2);
  subRow.height = 16;
  const subCell = subRow.getCell(1);
  subCell.value = subtitleLine;
  subCell.font = { size: 10, color: { argb: "FFFFFFFF" } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  setFill(subCell, HEADER_BG);

  // Header row
  const thRow = ws.addRow(HEADERS);
  thRow.height = 30;
  thRow.eachCell({ includeEmpty: true }, (cell) => {
    addBorder(cell);
    setFill(cell, HEADER_BG);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  // Data rows — no per-cell loop; numFmt comes from column default
  for (const row of rows) {
    ws.addRow([
      row.descripcion,
      row.claveProdServ,
      row.numFacturas,
      row.cantidad,
      row.importe,
    ]);
  }

  // Totals row
  const totImporte  = rows.reduce((s, r) => s + Number(r.importe),   0);
  const totCantidad = rows.reduce((s, r) => s + Number(r.cantidad),  0);
  const totFacturas = rows.reduce((s, r) => s + Number(r.numFacturas), 0);
  const totRow = ws.addRow(["TOTALES", null, totFacturas, totCantidad, totImporte]);
  totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    setFill(cell, HEADER_BG);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    if (ci === 4) cell.numFmt = NUM_FMT;
    if (ci === 5) cell.numFmt = MXN_FMT;
  });
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc   = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (!rfc || isNaN(year) || isNaN(month) || month < 1 || month > 12)
    return new Response("Parámetros inválidos", { status: 400 });

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc)))
    return new Response("RFC no encontrado", { status: 403 });

  const dateFrom = new Date(year, month - 1, 1);
  const dateTo   = new Date(year, month, 1);

  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const periodoLabel = `${MESES[month - 1]} ${year}`;

  try {
    const [data, nombreEmpresa] = await Promise.all([
      fetchEstadosFinancieros(rfc, dateFrom, dateTo, 1000),
      fetchNombreEmpresa(rfc),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "AIcuenta";
    wb.created = new Date();

    const subtitle = `${nombreEmpresa} · ${rfc} · ${periodoLabel}`;

    buildSheet(wb, "Ingresos por Concepto", ING_BG, "PRINCIPALES INGRESOS POR PRODUCTO / SERVICIO", subtitle, data.ingresos);
    buildSheet(wb, "Egresos por Concepto",  EGR_BG, "PRINCIPALES EGRESOS POR PRODUCTO / SERVICIO",  subtitle, data.egresos);

    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="estados-financieros_${rfc}_${String(month).padStart(2,"0")}-${year}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[export/estados-financieros]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
