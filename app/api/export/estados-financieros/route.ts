import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb, getDbLong } from "@/lib/db";
import { fetchEstadosFinancieros, fetchNombreEmpresa } from "@/lib/facturas-query";
import { rfcDisplay } from "@/lib/rfc-aliases";

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
const AUD_BG      = "1F4E79";
const MXN_FMT     = '"$"#,##0.00';
const NUM_FMT     = "#,##0.00";

const HEADERS = ["Descripción", "Clave Prod/Serv", "# Facturas", "Cantidad", "Subtotal", "IVA 8%", "IVA 16%", "Total c/IVA"];
const COL_WIDTHS = [55, 16, 12, 14, 18, 16, 16, 18];

interface AuditoriaConceptoRow {
  uuidFactura: string;
  fecha: Date;
  movimiento: string;
  tipoComprobante: string;
  rfcEmisor: string;
  rfcReceptor: string;
  claveProdServ: string;
  descripcion: string;
  cantidad: number;
  importe: number;
  descuento: number;
}

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
  rows: { descripcion: string; claveProdServ: string; cantidad: number; importe: number; iva8: number; iva16: number; numFacturas: number }[]) {
  const ws = wb.addWorksheet(sheetName);

  // Column widths + default numFmt (avoids per-cell formatting in data loop)
  ws.columns = [
    { width: COL_WIDTHS[0] },                         // 1 Descripción
    { width: COL_WIDTHS[1] },                         // 2 Clave
    { width: COL_WIDTHS[2] },                         // 3 # Facturas
    { width: COL_WIDTHS[3], style: { numFmt: NUM_FMT } }, // 4 Cantidad
    { width: COL_WIDTHS[4], style: { numFmt: MXN_FMT } }, // 5 Subtotal
    { width: COL_WIDTHS[5], style: { numFmt: MXN_FMT } }, // 6 IVA 8%
    { width: COL_WIDTHS[6], style: { numFmt: MXN_FMT } }, // 7 IVA 16%
    { width: COL_WIDTHS[7], style: { numFmt: MXN_FMT } }, // 8 Total c/IVA
  ];

  // Title row (merged, styled)
  ws.mergeCells(1, 1, 1, 8);
  const titleRow = ws.getRow(1);
  titleRow.height = 22;
  const titleCell = titleRow.getCell(1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  setFill(titleCell, titleBg);

  // Subtitle row (merged, styled)
  ws.mergeCells(2, 1, 2, 8);
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

  // Data rows
  for (const row of rows) {
    const total = Number(row.importe) + Number(row.iva8) + Number(row.iva16);
    ws.addRow([
      row.descripcion,
      row.claveProdServ,
      row.numFacturas,
      row.cantidad,
      row.importe,
      row.iva8,
      row.iva16,
      total,
    ]);
  }

  // Totals row
  const totImporte  = rows.reduce((s, r) => s + Number(r.importe),   0);
  const totIva8     = rows.reduce((s, r) => s + Number(r.iva8),      0);
  const totIva16    = rows.reduce((s, r) => s + Number(r.iva16),     0);
  const totTotal    = totImporte + totIva8 + totIva16;
  const totCantidad = rows.reduce((s, r) => s + Number(r.cantidad),  0);
  const totFacturas = rows.reduce((s, r) => s + Number(r.numFacturas), 0);
  const totRow = ws.addRow(["TOTALES", null, totFacturas, totCantidad, totImporte, totIva8, totIva16, totTotal]);
  totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    setFill(cell, HEADER_BG);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    if (ci === 4) cell.numFmt = NUM_FMT;
    if (ci >= 5) cell.numFmt = MXN_FMT;
  });
}

async function fetchAuditoriaConceptos(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<AuditoriaConceptoRow[]> {
  const db = await getDbLong();
  const result = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .query<AuditoriaConceptoRow>(`
      SELECT
        f.UUID                                                        AS uuidFactura,
        f.Fecha                                                       AS fecha,
        CASE WHEN f.RFC_Emisor = @rfc THEN 'INGRESO' ELSE 'EGRESO' END AS movimiento,
        ISNULL(f.TipoComprobante,'')                                  AS tipoComprobante,
        ISNULL(f.RFC_Emisor,'')                                       AS rfcEmisor,
        ISNULL(f.RFC_Receptor,'')                                     AS rfcReceptor,
        ISNULL(NULLIF(c.ClaveProductoServicio,''), '')                AS claveProdServ,
        ISNULL(NULLIF(c.Descripcion,''), 'Sin descripción')           AS descripcion,
        ISNULL(TRY_CONVERT(decimal(18,4), c.Cantidad), 0)             AS cantidad,
        ISNULL(TRY_CONVERT(decimal(18,2), c.Importe), 0)              AS importe,
        ISNULL(TRY_CONVERT(decimal(18,2), c.Descuento), 0)            AS descuento
      FROM facturalo_cfdis f WITH (NOLOCK)
      INNER JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID))
        ON c.UUID = f.UUID AND c.rfc_cliente = @rfc
      WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        AND f.TipoComprobante IN ('I','E','N','P')
      ORDER BY claveProdServ ASC, f.Fecha DESC, f.UUID DESC, descripcion ASC
    `);

  return result.recordset;
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

  const dateFrom = new Date(Date.UTC(year, month - 1, 1));
  const dateTo   = new Date(Date.UTC(year, month, 1));

  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const periodoLabel = `${MESES[month - 1]} ${year}`;

  try {
    const [data, nombreEmpresa] = await Promise.all([
      fetchEstadosFinancieros(rfc, dateFrom, dateTo),
      fetchNombreEmpresa(rfc),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "AIcuenta";
    wb.created = new Date();

    const subtitle = `${nombreEmpresa} · ${rfcDisplay(rfc)} · ${periodoLabel}`;

    buildSheet(wb, "Ingresos por Concepto", ING_BG, "PRINCIPALES INGRESOS POR PRODUCTO / SERVICIO", subtitle, data.ingresos);
    buildSheet(wb, "Egresos por Concepto",  EGR_BG, "PRINCIPALES EGRESOS POR PRODUCTO / SERVICIO",  subtitle, data.egresos);

    const auditRows = await fetchAuditoriaConceptos(rfc, dateFrom, dateTo);
    const auditWs = wb.addWorksheet("Auditoria Conceptos");
    auditWs.columns = [
      { width: 38 },
      { width: 13 },
      { width: 12 },
      { width: 10 },
      { width: 17 },
      { width: 17 },
      { width: 18 },
      { width: 58 },
      { width: 12, style: { numFmt: NUM_FMT } },
      { width: 18, style: { numFmt: MXN_FMT } },
      { width: 18, style: { numFmt: MXN_FMT } },
    ];

    auditWs.mergeCells(1, 1, 1, 11);
    const auditTitleRow = auditWs.getRow(1);
    auditTitleRow.height = 22;
    const auditTitleCell = auditTitleRow.getCell(1);
    auditTitleCell.value = "AUDITORÍA DE CONCEPTOS";
    auditTitleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    auditTitleCell.alignment = { vertical: "middle", horizontal: "center" };
    setFill(auditTitleCell, AUD_BG);

    auditWs.mergeCells(2, 1, 2, 11);
    const auditSubRow = auditWs.getRow(2);
    auditSubRow.height = 16;
    const auditSubCell = auditSubRow.getCell(1);
    auditSubCell.value = subtitle;
    auditSubCell.font = { size: 10, color: { argb: "FFFFFFFF" } };
    auditSubCell.alignment = { vertical: "middle", horizontal: "center" };
    setFill(auditSubCell, HEADER_BG);

    const auditHeaders = [
      "UUID Factura",
      "Fecha",
      "Movimiento",
      "Tipo",
      "RFC Emisor",
      "RFC Receptor",
      "Clave Prod/Serv",
      "Descripción Concepto",
      "Cantidad",
      "Importe",
      "Descuento",
    ];
    const auditHeaderRow = auditWs.addRow(auditHeaders);
    auditHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell);
      setFill(cell, AUD_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    for (const row of auditRows) {
      const auditDataRow = auditWs.addRow([
        row.uuidFactura,
        row.fecha,
        row.movimiento,
        row.tipoComprobante,
        row.rfcEmisor,
        row.rfcReceptor,
        row.claveProdServ,
        row.descripcion,
        row.cantidad,
        row.importe,
        row.descuento,
      ]);

      auditDataRow.getCell(2).numFmt = "dd/mm/yyyy";
      auditDataRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        if (ci >= 9) cell.numFmt = ci === 9 ? NUM_FMT : MXN_FMT;
      });
    }

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
