import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchRawCFDIForExport, fetchNombreEmpresa } from "@/lib/facturas-query";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("uid", userId).input("rfc", rfc)
    .query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc");
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const TIPOS = ["INGRESOS","GASTOS","GASTOS - NOMINA"] as const;
type Tipo = typeof TIPOS[number];

// Colors match sacarColor() in variablesEstaticas.js (pass 6-char hex; setFill prepends FF)
const C = {
  HEADER_BG: "595959",  // GRIS  — company header
  AZUL:      "1F4E79",  // AZUL  — INGRESOS section title/totals, grand TOTAL INGRESOS
  GRIS:      "595959",  // GRIS  — GASTOS section title/totals, TOTAL GENERAL MES, grand TOTAL GASTOS
  VERDE:     "2E7D32",  // VERDE — NOMINA section title/totals
  GRISCLARO: "E8E8E8",  // GRISCLARO — RFC group subtotals
  AMARILLO:  "FFFF00",  // AMARILLO — Efectivo rows (FF+FFFF00 = FFFFFF00)
};

const MXN = '"$"#,##0.00';

// ─── Totals structure ──────────────────────────────────────────────────────────

interface Totales {
  subtotal: number; iva8: number; iva16: number;
  retISR: number; retIVA: number; descuento: number;
  total: number; retenidos: number;
}
function resetTotales(): Totales {
  return { subtotal: 0, iva8: 0, iva16: 0, retISR: 0, retIVA: 0, descuento: 0, total: 0, retenidos: 0 };
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0; }

// ─── SAT code translators ──────────────────────────────────────────────────────

function tipoCFDI(t: string): string {
  return (({ I: "Ingreso", E: "Egreso", N: "Nómina", P: "Pago", T: "Traslado" }) as Record<string,string>)[t] ?? t;
}
function formaDePago(c: string): string {
  const m: Record<string,string> = {
    "01": "Efectivo", "02": "Cheque nominativo", "03": "Transferencia electrónica",
    "04": "Tarjeta de crédito", "05": "Monedero electrónico", "06": "Dinero electrónico",
    "08": "Vales de despensa", "28": "Tarjeta de débito", "29": "Tarjeta de servicios",
    "30": "Aplicación de anticipos", "99": "Por definir",
  };
  return m[c] ?? c;
}

// ─── Month helpers ─────────────────────────────────────────────────────────────

function mesKey(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = fecha.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}-${MESES_ES[parseInt(m) - 1]}`;
}
function mesLabelLong(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES_ES[parseInt(m) - 1]} ${y}`;
}

// ─── Column definitions ────────────────────────────────────────────────────────

// Headers match writeTableHeaders() in variablesEspecificas.js
const TABLE_HEADERS = [
  "Fecha", "Folio", "Emisor", "Régimen Emisor", "Receptor", "Régimen Receptor",
  "Subtotal", "IVA 8%", "IVA 16%", "Total Trasladados", "Retencion ISR", "Retencion IVA", "Descuento", "Total",
  "Moneda", "Clasificación", "Comprobante", "Forma pago", "Método Pago", "Uso CFDI",
];
const COL_MAIN = TABLE_HEADERS.length;
const COL_WIDTHS_MAIN = [13, 38, 18, 17, 16, 13, 13, 13, 13, 18, 13, 13, 13, 13, 10, 13, 13, 22, 13, 10];

const TOT_HEADERS = ["Mes", "Tipo", "Subtotal", "IVA 8", "IVA 16", "IVA Total", "Descuento", "Ret ISR", "Ret IVA", "Total Retenciones", "Total"];
const COL_TOT = TOT_HEADERS.length;
const COL_WIDTHS_TOT = [22, 22, 14, 13, 13, 13, 13, 13, 13, 18, 14];

const RET_HEADERS = ["RFC Emisor", "Régimen Emisor", "RFC Receptor", "Régimen Receptor", "Clasificación", "Subtotal", "IVA 8%", "IVA 16%", "Total Trasladados", "Ret ISR", "Ret IVA", "Ret Total", "Descuento", "Total", "Mes"];
const COL_RET = RET_HEADERS.length;
const COL_WIDTHS_RET = [16, 20, 16, 20, 22, 14, 13, 13, 16, 13, 13, 16, 13, 14, 16];

// ─── Excel style helpers ───────────────────────────────────────────────────────

function addBorder(cell: ExcelJS.Cell) {
  const b: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
  cell.border = { top: b, bottom: b, left: b, right: b };
}
function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
}

// Matches escribirEncabezadoRfc() in variablesEspecificas.js
function companyHeader(ws: ExcelJS.Worksheet, nombre: string, colCount: number) {
  const row = ws.addRow([nombre]);
  row.height = 20;
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  setFill(cell, C.HEADER_BG);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  addBorder(cell);
  ws.mergeCells(row.number, 1, row.number, colCount);
}

// Plain header row — matches writeTableHeaders() / headerTotales style (bold, centered, bordered, no fill)
function plainHeaderRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.font = { bold: true };
  row.eachCell({ includeEmpty: true }, (cell) => {
    addBorder(cell);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function sectionTitle(ws: ExcelJS.Worksheet, tipo: Tipo) {
  const bg = tipo === "INGRESOS" ? C.AZUL : tipo === "GASTOS" ? C.GRIS : C.VERDE;
  const row = ws.addRow([tipo]);
  row.height = 20;
  const cell = row.getCell(1);
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  setFill(cell, bg);
  cell.alignment = { vertical: "middle" };
  ws.mergeCells(row.number, 1, row.number, COL_MAIN);
}

// Matches writeTableHeaders() — bold, centered, bordered, no background fill
function tableHeaderRow(ws: ExcelJS.Worksheet) {
  plainHeaderRow(ws, TABLE_HEADERS);
}

type RowTuple = [string, string, string, string, string, string, number, number, number, number, number, number, number, number, string, string, string, string, string, string];

function addDataRow(ws: ExcelJS.Worksheet, r: RowTuple) {
  const fp = r[17] as string;
  const esEfectivo = fp === "Efectivo";
  const row = ws.addRow(r);
  row.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    if (ci >= 7 && ci <= 14) cell.numFmt = MXN;
    if (esEfectivo) setFill(cell, C.AMARILLO);
  });
}

// Matches writeTotales() in variablesEspecificas.js:
// label "TOTALES" at col 6, no merge, only numeric cols 7+ get colored bg
function sectionTotalsRow(ws: ExcelJS.Worksheet, tipo: Tipo, t: Totales) {
  const bg = tipo === "INGRESOS" ? C.AZUL : tipo === "GASTOS" ? C.GRIS : C.VERDE;
  ws.addRow([]);
  const row = ws.addRow([
    "", "", "", "", "", "TOTALES",
    t.subtotal, t.iva8, t.iva16, t.iva8 + t.iva16,
    t.retISR, t.retIVA, t.descuento, t.total,
  ]);
  row.font = { bold: true };
  row.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    cell.alignment = { vertical: "middle", horizontal: "right" };
    if (ci >= 7 && ci <= 14) cell.numFmt = MXN;
    if (ci >= 7) {
      setFill(cell, bg);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
  });
}

function totalesMesRow(wsTot: ExcelJS.Worksheet, label: string, tipo: Tipo, t: Totales) {
  const row = wsTot.addRow([
    label, tipo,
    t.subtotal, t.iva8, t.iva16, t.iva8 + t.iva16,
    t.descuento, t.retISR, t.retIVA, t.retenidos, t.total,
  ]);
  row.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    cell.alignment = { vertical: "middle", horizontal: ci <= 2 ? "left" : "right" };
    if (ci >= 3) cell.numFmt = MXN;
  });
}

// ─── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc    = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year   = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP = searchParams.get("month");
  const month  = monthP ? parseInt(monthP, 10) : null;

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year)) return NextResponse.json({ error: "year invalido" }, { status: 400 });
  if (month !== null && (isNaN(month) || month < 1 || month > 12))
    return NextResponse.json({ error: "month invalido" }, { status: 400 });

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc)))
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });

  const dateFrom = month !== null ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const dateTo   = month !== null ? new Date(year, month, 1)     : new Date(year + 1, 0, 1);
  const periodLabel = month !== null ? `${String(month).padStart(2, "0")}-${year}` : String(year);

  try {
    const [rawRows, nombreEmpresa] = await Promise.all([
      fetchRawCFDIForExport(rfc, dateFrom, dateTo),
      fetchNombreEmpresa(rfc),
    ]);

    // ── Buffer rows by month and tipo ────────────────────────────────────────
    const totales: Record<string, Record<Tipo, Totales>> = {};
    const buffers: Record<string, Record<Tipo, RowTuple[]>> = {};
    type RetTuple = [string, string, string, string, string, number, number, number, number, number, number, number, number, number, string];
    const retencionesRows: RetTuple[] = [];

    for (const row of rawRows) {
      const tc  = n(row.tipoCambio) || 1;
      const mov = (row.Movimiento ?? "").trim().toUpperCase();

      let tipo: Tipo;
      if (row.TipoComprobante === "N")   tipo = "GASTOS - NOMINA";
      else if (mov === "INGRESO")        tipo = "INGRESOS";
      else if (mov === "EGRESO")         tipo = "GASTOS";
      else                               continue;

      const fecha = new Date(row.Fecha);
      const mes   = mesKey(fecha);

      if (!buffers[mes]) {
        totales[mes] = { INGRESOS: resetTotales(), GASTOS: resetTotales(), "GASTOS - NOMINA": resetTotales() };
        buffers[mes] = { INGRESOS: [], GASTOS: [], "GASTOS - NOMINA": [] };
      }

      const dd   = String(fecha.getDate()).padStart(2, "0");
      const mm   = String(fecha.getMonth() + 1).padStart(2, "0");
      const yyyy = fecha.getFullYear();

      const subtotal  = n(row.Subtotal) * tc;
      const iva8      = n(row.IVA8) * tc;
      const iva16     = n(row.IVA16) * tc;
      const totalTras = n(row.TotalTrasladado) * tc;
      const retISR    = n(row.RetISR) * tc;
      const retIVA    = n(row.RetIVA) * tc;
      const descuento = n(row.Descuento) * tc;
      const total     = n(row.Total) * tc;
      const fp        = formaDePago(row.TipoPago);

      buffers[mes][tipo].push([
        `${dd}/${mm}/${yyyy}`, row.UUID,
        row.RFC_Emisor, row.RegimenFiscal,
        row.RFC_Receptor, row.RegimenFiscalReceptor,
        subtotal, iva8, iva16, totalTras,
        retISR, retIVA, descuento, total,
        row.Moneda, row.Movimiento,
        tipoCFDI(row.TipoComprobante), fp,
        row.MetodoPago, row.UsoCFDI,
      ]);

      const t = totales[mes][tipo];
      t.subtotal  += subtotal;
      t.iva8      += iva8;
      t.iva16     += iva16;
      t.retISR    += retISR;
      t.retIVA    += retIVA;
      t.descuento += descuento;
      t.total     += total;

      const totalRetencion = retISR + retIVA;
      if (totalRetencion !== 0) {
        t.retenidos += totalRetencion;
        retencionesRows.push([
          row.RFC_Emisor, row.RegimenFiscal,
          row.RFC_Receptor, row.RegimenFiscalReceptor,
          tipo,
          subtotal, iva8, iva16, totalTras,
          retISR, retIVA, totalRetencion,
          descuento, total,
          mesLabelLong(mes),
        ]);
      }
    }

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "AIcuenta";
    wb.created = new Date();

    // ── TOTALES sheet (first) ─────────────────────────────────────────────────
    const wsTot = wb.addWorksheet("TOTALES");
    wsTot.columns = COL_WIDTHS_TOT.map(w => ({ width: w }));
    companyHeader(wsTot, nombreEmpresa, COL_TOT);
    plainHeaderRow(wsTot, TOT_HEADERS);

    // ── Monthly sheets ─────────────────────────────────────────────────────────
    const mesesArray = Object.keys(buffers).sort();
    let sumaIngresos = resetTotales();
    let sumaGastos   = resetTotales();

    for (const mes of mesesArray) {
      const hasData = TIPOS.some(tp => buffers[mes][tp].length > 0);
      if (!hasData) continue;

      const ws = wb.addWorksheet(mesLabel(mes));
      ws.columns = COL_WIDTHS_MAIN.map(w => ({ width: w }));
      companyHeader(ws, nombreEmpresa, COL_MAIN);
      ws.addRow([]);

      for (const tipo of TIPOS) {
        const rows = buffers[mes][tipo];
        if (!rows || rows.length === 0) continue;

        sectionTitle(ws, tipo);
        tableHeaderRow(ws);

        rows.sort((a, b) => {
          const [da, ma, ya] = (a[0] as string).split("/").map(Number);
          const [db, mb, yb] = (b[0] as string).split("/").map(Number);
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
        });

        if (tipo === "GASTOS") {
          const byRFC: Record<string, { rows: RowTuple[]; tot: Totales }> = {};
          for (const r of rows) {
            const rfcEm = r[2] as string;
            if (!byRFC[rfcEm]) byRFC[rfcEm] = { rows: [], tot: resetTotales() };
            byRFC[rfcEm].rows.push(r);
            const gt = byRFC[rfcEm].tot;
            gt.subtotal  += n(r[6]);
            gt.iva8      += n(r[7]);
            gt.iva16     += n(r[8]);
            gt.retISR    += n(r[10]);
            gt.retIVA    += n(r[11]);
            gt.descuento += n(r[12]);
            gt.total     += n(r[13]);
          }
          for (const [rfcEm, grupo] of Object.entries(byRFC)) {
            grupo.rows.forEach(r => addDataRow(ws, r));

            const tRow = ws.addRow([
              `TOTAL: ${rfcEm}`, "", "", "", "", "",
              grupo.tot.subtotal, grupo.tot.iva8, grupo.tot.iva16, grupo.tot.iva8 + grupo.tot.iva16,
              grupo.tot.retISR, grupo.tot.retIVA, grupo.tot.descuento, grupo.tot.total,
              "", "", "", "", "", "",
            ]);
            ws.mergeCells(tRow.number, 1, tRow.number, 5); // merge 1-5, matches formato.js
            tRow.font = { bold: true };
            tRow.eachCell({ includeEmpty: true }, (cell, ci) => {
              setFill(cell, C.GRISCLARO);
              addBorder(cell);
              cell.alignment = { vertical: "middle", horizontal: "right" };
              if (ci >= 7 && ci <= 14) cell.numFmt = MXN;
            });
          }
        } else {
          rows.forEach(r => addDataRow(ws, r));
        }

        sectionTotalsRow(ws, tipo, totales[mes][tipo]);
      }

      // Total General Mes
      const tIn = totales[mes]["INGRESOS"];
      const tGa = totales[mes]["GASTOS"];
      const tNo = totales[mes]["GASTOS - NOMINA"];
      const tgm = {
        subtotal:  tIn.subtotal  + tGa.subtotal  + tNo.subtotal,
        iva8:      tIn.iva8      + tGa.iva8      + tNo.iva8,
        iva16:     tIn.iva16     + tGa.iva16     + tNo.iva16,
        retISR:    tIn.retISR    + tGa.retISR    + tNo.retISR,
        retIVA:    tIn.retIVA    + tGa.retIVA    + tNo.retIVA,
        descuento: tIn.descuento + tGa.descuento + tNo.descuento,
        total:     tIn.total     + tGa.total     + tNo.total,
      };
      ws.addRow([]);
      const tgRow = ws.addRow([
        "TOTAL GENERAL MES", "", "", "", "", "",
        tgm.subtotal, tgm.iva8, tgm.iva16, tgm.iva8 + tgm.iva16,
        tgm.retISR, tgm.retIVA, tgm.descuento, tgm.total,
        "", "", "", "", "", "",
      ]);
      ws.mergeCells(tgRow.number, 1, tgRow.number, 6);
      tgRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      tgRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        setFill(cell, C.GRIS);
        addBorder(cell);
        cell.alignment = { vertical: "middle", horizontal: ci === 1 ? "left" : "right" };
        if (ci >= 7 && ci <= 14) cell.numFmt = MXN;
      });

      // Write this month to TOTALES sheet
      for (const tipo of TIPOS) {
        const t = totales[mes][tipo];
        if (t.total !== 0 || t.retenidos !== 0) {
          totalesMesRow(wsTot, mesLabel(mes), tipo, t);
        }
      }

      const keys = ["subtotal","iva8","iva16","retISR","retIVA","descuento","total","retenidos"] as const;
      keys.forEach(k => {
        sumaIngresos[k] += tIn[k];
        sumaGastos[k]   += tGa[k] + tNo[k];
      });
    }

    // Grand totals in TOTALES sheet
    wsTot.addRow([]);
    const siRow = wsTot.addRow([
      "", "TOTAL INGRESOS",
      sumaIngresos.subtotal, sumaIngresos.iva8, sumaIngresos.iva16, sumaIngresos.iva8 + sumaIngresos.iva16,
      sumaIngresos.descuento, sumaIngresos.retISR, sumaIngresos.retIVA, sumaIngresos.retenidos, sumaIngresos.total,
    ]);
    siRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    siRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      setFill(cell, C.AZUL);
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: ci <= 2 ? "left" : "right" };
      if (ci >= 3) cell.numFmt = MXN;
    });

    const sgRow = wsTot.addRow([
      "", "TOTAL GASTOS Y NOMINA",
      sumaGastos.subtotal, sumaGastos.iva8, sumaGastos.iva16, sumaGastos.iva8 + sumaGastos.iva16,
      sumaGastos.descuento, sumaGastos.retISR, sumaGastos.retIVA, sumaGastos.retenidos, sumaGastos.total,
    ]);
    sgRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    sgRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      setFill(cell, C.GRIS);
      addBorder(cell);
      cell.alignment = { vertical: "middle", horizontal: ci <= 2 ? "left" : "right" };
      if (ci >= 3) cell.numFmt = MXN;
    });

    // ── RETENCIONES sheet ─────────────────────────────────────────────────────
    if (retencionesRows.length > 0) {
      const wsRet = wb.addWorksheet("RETENCIONES");
      wsRet.columns = COL_WIDTHS_RET.map(w => ({ width: w }));
      companyHeader(wsRet, nombreEmpresa, COL_RET);
      wsRet.addRow([]);
      plainHeaderRow(wsRet, RET_HEADERS);
      for (const r of retencionesRows) {
        const row = wsRet.addRow(r);
        row.eachCell({ includeEmpty: true }, (cell, ci) => {
          addBorder(cell);
          if (ci >= 6 && ci <= 14) cell.numFmt = MXN;
        });
      }
    }

    // ── Send response ─────────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="facturas_${rfc}_${periodLabel}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export/facturas]", (err as Error).message);
    return NextResponse.json({ error: "Error al generar el reporte" }, { status: 503 });
  }
}
