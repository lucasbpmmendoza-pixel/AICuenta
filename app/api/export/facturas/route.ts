import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchRawCFDIForExport, fetchNombreEmpresa } from "@/lib/facturas-query";
import { rfcDisplay } from "@/lib/rfc-aliases";

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
  retISR: number; retSegundo: number; retSecundaria: number; descuento: number;
  total: number; retenidos: number;
}
function resetTotales(): Totales {
  return {
    subtotal: 0,
    iva8: 0,
    iva16: 0,
    retISR: 0,
    retSegundo: 0,
    retSecundaria: 0,
    descuento: 0,
    total: 0,
    retenidos: 0,
  };
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0; }

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function firstObject(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const obj = asObject(item);
      if (obj) return obj;
    }
    return null;
  }
  return asObject(v);
}

function parseNominaDeducciones(raw: unknown): {
  retISR: number;
  imss: number;
  retSecundaria: number;
  ajusteNeto: number;
  totalDeducciones: number;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { retISR: 0, imss: 0, retSecundaria: 0, ajusteNeto: 0, totalDeducciones: 0 };
  }

  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { retISR: 0, imss: 0, retSecundaria: 0, ajusteNeto: 0, totalDeducciones: 0 };
    }
  }

  const root = firstObject(data);
  if (!root) return { retISR: 0, imss: 0, retSecundaria: 0, ajusteNeto: 0, totalDeducciones: 0 };

  const collectDeductionRows = (): Record<string, unknown>[] => {
    const candidates: unknown[] = [
      root,
      root.NominaDeducciones,
      root.nominaDeducciones,
      root.Deducciones,
      root.Deduccion,
      root.DeduccionesNomina,
      root.Deductions,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map(asObject).filter(Boolean) as Record<string, unknown>[];
      }
      const obj = asObject(candidate);
      if (!obj) continue;

      const rows = [
        obj.Deduccion,
        obj.Deducciones,
        obj.items,
        obj.detalle,
        obj.detalles,
      ];
      for (const rowsCandidate of rows) {
        if (Array.isArray(rowsCandidate)) {
          return rowsCandidate.map(asObject).filter(Boolean) as Record<string, unknown>[];
        }
        const rowObj = asObject(rowsCandidate);
        if (rowObj) return [rowObj];
      }
    }

    return [];
  };

  const rows = collectDeductionRows();
  let retISR = 0;
  let imss = 0;
  let retSecundaria = 0;
  let ajusteNeto = 0;

  const register = (row: Record<string, unknown>) => {
    const tipo = String(row.TipoDeduccion ?? row.tipoDeduccion ?? row.Clave ?? row.clave ?? "").trim();
    const concepto = String(row.Concepto ?? row.concepto ?? row.Descripcion ?? row.descripcion ?? "").toLowerCase();
    const importe = n(row.Importe ?? row.importe ?? row.Monto ?? row.monto ?? row.Valor ?? row.valor);
    const impuesto = String(row.Impuesto ?? row.impuesto ?? "").toLowerCase();

    if (importe <= 0) return;

    // Nómina SAT: 002 = ISR retenido
    if (tipo === "002" || concepto.includes("isr") || impuesto.includes("isr")) {
      retISR += importe;
      return;
    }

    // Nómina SAT: 001 = Seguridad social (IMSS)
    if (tipo === "001" || concepto.includes("imss") || concepto.includes("seguridad social")) {
      imss += importe;
      return;
    }

    // Frecuente en nómina: "Ajuste al neto" (normalmente tipo 004)
    if (tipo === "004" || (concepto.includes("ajuste") && concepto.includes("neto"))) {
      ajusteNeto += importe;
      return;
    }

    // Cualquier otra deducción de nómina se reporta como secundaria.
    retSecundaria += importe;
  };

  rows.forEach(register);

  const totalImpuestosRet = n(root.TotalImpuestosRetenidos ?? root.totalImpuestosRetenidos ?? root.TotalRetenidos ?? root.totalRetenidos);
  const totalOtrasDed = n(root.TotalOtrasDeducciones ?? root.totalOtrasDeducciones);
  const totalDeducciones = n(
    root.TotalDeducciones
    ?? root.totalDeducciones
    ?? root.Descuento
    ?? root.descuento
    ?? (totalImpuestosRet + totalOtrasDed)
  );

  const resumenPorTipo = asObject(root.resumenPorTipo ?? root.ResumenPorTipo);
  if (retISR === 0 && resumenPorTipo) {
    retISR = n(resumenPorTipo["002"]);
  }
  if (imss === 0 && resumenPorTipo) {
    imss = n(resumenPorTipo["001"]);
  }

  if (retISR === 0 && totalImpuestosRet > 0) retISR = totalImpuestosRet;

  return { retISR, imss, retSecundaria, ajusteNeto, totalDeducciones };
}

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
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + 1;
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
  "Subtotal", "IVA 8%", "IVA 16%", "Total Trasladados", "Retencion ISR", "Retencion IMSS", "Retencion Secundaria", "Descuento", "Total",
  "Moneda", "Clasificación", "Comprobante", "Forma pago", "Método Pago", "Uso CFDI",
];
const COL_MAIN = TABLE_HEADERS.length;
const COL_WIDTHS_MAIN = [13, 38, 18, 17, 16, 13, 13, 13, 13, 18, 13, 14, 14, 13, 13, 10, 13, 13, 22, 13, 10];

const TOT_HEADERS = ["Mes", "Tipo", "Subtotal", "IVA 8", "IVA 16", "IVA Total", "Descuento", "Ret ISR", "Ret IMSS", "Ret Secundaria", "Total Retenciones", "Total"];
const COL_TOT = TOT_HEADERS.length;
const COL_WIDTHS_TOT = [22, 22, 14, 13, 13, 13, 13, 13, 14, 14, 18, 14];

const RET_HEADERS = ["RFC Emisor", "Régimen Emisor", "RFC Receptor", "Régimen Receptor", "Clasificación", "Subtotal", "IVA 8%", "IVA 16%", "Total Trasladados", "Ret ISR", "Ret IMSS", "Ret Secundaria", "Ret Total", "Descuento", "Total", "Mes"];
const COL_RET = RET_HEADERS.length;
const COL_WIDTHS_RET = [16, 20, 16, 20, 22, 14, 13, 13, 16, 13, 14, 14, 16, 13, 14, 16];

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

type RowTuple = [string, string, string, string, string, string, number, number, number, number, number, number, number, number, number, string, string, string, string, string, string];

function addDataRow(ws: ExcelJS.Worksheet, r: RowTuple) {
  const fp = r[18] as string;
  const esEfectivo = fp === "Efectivo";
  const row = ws.addRow(r);
  row.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    if (ci >= 7 && ci <= 15) cell.numFmt = MXN;
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
    t.retISR, t.retSegundo, t.retSecundaria, t.descuento, t.total,
  ]);
  row.font = { bold: true };
  row.eachCell({ includeEmpty: true }, (cell, ci) => {
    addBorder(cell);
    cell.alignment = { vertical: "middle", horizontal: "right" };
    if (ci >= 7 && ci <= 15) cell.numFmt = MXN;
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
    t.descuento, t.retISR, t.retSegundo, t.retSecundaria, t.retenidos, t.total,
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
  const rfc       = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year      = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP    = searchParams.get("month");
  const quarterP  = searchParams.get("quarter");
  const dateFromP = searchParams.get("dateFrom");
  const dateToP   = searchParams.get("dateTo");

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });

  let dateFrom: Date;
  let dateTo: Date;
  let periodLabel: string;

  if (dateFromP && dateToP) {
    const df = new Date(dateFromP);
    const dt = new Date(dateToP);
    if (isNaN(df.getTime()) || isNaN(dt.getTime()))
      return NextResponse.json({ error: "fechas inválidas" }, { status: 400 });
    dateFrom    = df;
    dateTo      = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
    periodLabel = `${dateFromP}_${dateToP}`;
  } else {
    if (isNaN(year)) return NextResponse.json({ error: "year invalido" }, { status: 400 });
    if (quarterP !== null) {
      const q = parseInt(quarterP, 10);
      if (isNaN(q) || q < 1 || q > 4) return NextResponse.json({ error: "quarter invalido" }, { status: 400 });
      dateFrom    = new Date(Date.UTC(year, (q - 1) * 3, 1));
      dateTo      = new Date(Date.UTC(year, q * 3, 1));
      periodLabel = `Q${q}-${year}`;
    } else if (monthP !== null) {
      const month = parseInt(monthP, 10);
      if (isNaN(month) || month < 1 || month > 12) return NextResponse.json({ error: "month invalido" }, { status: 400 });
      dateFrom    = new Date(Date.UTC(year, month - 1, 1));
      dateTo      = new Date(Date.UTC(year, month, 1));
      periodLabel = `${String(month).padStart(2, "0")}-${year}`;
    } else {
      dateFrom    = new Date(Date.UTC(year, 0, 1));
      dateTo      = new Date(Date.UTC(year + 1, 0, 1));
      periodLabel = String(year);
    }
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc)))
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });

  try {
    const [rawRows, nombreEmpresa] = await Promise.all([
      fetchRawCFDIForExport(rfc, dateFrom, dateTo),
      fetchNombreEmpresa(rfc),
    ]);

    // ── Buffer rows by month and tipo ────────────────────────────────────────
    const totales: Record<string, Record<Tipo, Totales>> = {};
    const buffers: Record<string, Record<Tipo, RowTuple[]>> = {};
    type RetTuple = [string, string, string, string, string, number, number, number, number, number, number, number, number, number, number, string];
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

      const dd   = String(fecha.getUTCDate()).padStart(2, "0");
      const mm   = String(fecha.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = fecha.getUTCFullYear();

      const subtotal  = n(row.Subtotal) * tc;
      const iva8      = n(row.IVA8) * tc;
      const iva16     = n(row.IVA16) * tc;
      const totalTras = n(row.TotalTrasladado) * tc;
      const parsedNomina = row.TipoComprobante === "N"
        ? parseNominaDeducciones((row as { NominaDeducciones?: string | null }).NominaDeducciones)
        : { retISR: 0, imss: 0, retSecundaria: 0, ajusteNeto: 0, totalDeducciones: 0 };
      const retISR    = (parsedNomina.retISR > 0 ? parsedNomina.retISR : n(row.RetISR)) * tc;
      const retSegundo = (row.TipoComprobante === "N"
        ? (parsedNomina.imss > 0 ? parsedNomina.imss : 0)
        : n(row.RetIVA)) * tc;
      const retSecundaria = (row.TipoComprobante === "N" ? parsedNomina.retSecundaria : 0) * tc;
      const descuentoBase = n(row.Descuento);
      const descuentoNomina = row.TipoComprobante === "N" && descuentoBase === 0 && parsedNomina.totalDeducciones > 0
        ? parsedNomina.totalDeducciones
        : descuentoBase;
      const descuento = descuentoNomina * tc;
      const total     = n(row.Total) * tc;
      const fp        = formaDePago(row.TipoPago);

      buffers[mes][tipo].push([
        `${dd}/${mm}/${yyyy}`, row.UUID,
        rfcDisplay(row.RFC_Emisor), row.RegimenFiscal,
        rfcDisplay(row.RFC_Receptor), row.RegimenFiscalReceptor,
        subtotal, iva8, iva16, totalTras,
        retISR, retSegundo, retSecundaria, descuento, total,
        row.Moneda, row.Movimiento,
        tipoCFDI(row.TipoComprobante), fp,
        row.MetodoPago, row.UsoCFDI,
      ]);

      const t = totales[mes][tipo];
      t.subtotal  += subtotal;
      t.iva8      += iva8;
      t.iva16     += iva16;
      t.retISR    += retISR;
      t.retSegundo += retSegundo;
      t.retSecundaria += retSecundaria;
      t.descuento += descuento;
      t.total     += total;

      const totalRetencion = retISR + retSegundo + retSecundaria;
      if (totalRetencion !== 0) {
        t.retenidos += totalRetencion;
        retencionesRows.push([
          rfcDisplay(row.RFC_Emisor), row.RegimenFiscal,
          rfcDisplay(row.RFC_Receptor), row.RegimenFiscalReceptor,
          tipo,
          subtotal, iva8, iva16, totalTras,
          retISR, retSegundo, retSecundaria, totalRetencion,
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
            gt.retSegundo += n(r[11]);
            gt.retSecundaria += n(r[12]);
            gt.descuento += n(r[13]);
            gt.total     += n(r[14]);
          }
          for (const [rfcEm, grupo] of Object.entries(byRFC)) {
            grupo.rows.forEach(r => addDataRow(ws, r));

            const tRow = ws.addRow([
              `TOTAL: ${rfcEm}`, "", "", "", "", "",
              grupo.tot.subtotal, grupo.tot.iva8, grupo.tot.iva16, grupo.tot.iva8 + grupo.tot.iva16,
              grupo.tot.retISR, grupo.tot.retSegundo, grupo.tot.retSecundaria, grupo.tot.descuento, grupo.tot.total,
              "", "", "", "", "", "",
            ]);
            ws.mergeCells(tRow.number, 1, tRow.number, 5); // merge 1-5, matches formato.js
            tRow.font = { bold: true };
            tRow.eachCell({ includeEmpty: true }, (cell, ci) => {
              setFill(cell, C.GRISCLARO);
              addBorder(cell);
              cell.alignment = { vertical: "middle", horizontal: "right" };
              if (ci >= 7 && ci <= 15) cell.numFmt = MXN;
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
      const tOut = {
        subtotal:  tGa.subtotal  + tNo.subtotal,
        iva8:      tGa.iva8      + tNo.iva8,
        iva16:     tGa.iva16     + tNo.iva16,
        retISR:    tGa.retISR    + tNo.retISR,
        retSegundo: tGa.retSegundo + tNo.retSegundo,
        retSecundaria: tGa.retSecundaria + tNo.retSecundaria,
        descuento: tGa.descuento + tNo.descuento,
        total:     tGa.total     + tNo.total,
      };
      const tgm = {
        subtotal:  tIn.subtotal  - tOut.subtotal,
        iva8:      tIn.iva8      - tOut.iva8,
        iva16:     tIn.iva16     - tOut.iva16,
        retISR:    tIn.retISR    - tOut.retISR,
        retSegundo: tIn.retSegundo - tOut.retSegundo,
        retSecundaria: tIn.retSecundaria - tOut.retSecundaria,
        descuento: tIn.descuento - tOut.descuento,
        total:     tIn.total     - tOut.total,
      };
      ws.addRow([]);
      const tgRow = ws.addRow([
        "TOTAL GENERAL MES", "", "", "", "", "",
        tgm.subtotal, tgm.iva8, tgm.iva16, tgm.iva8 + tgm.iva16,
        tgm.retISR, tgm.retSegundo, tgm.retSecundaria, tgm.descuento, tgm.total,
        "", "", "", "", "", "",
      ]);
      ws.mergeCells(tgRow.number, 1, tgRow.number, 6);
      tgRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      tgRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        setFill(cell, C.GRIS);
        addBorder(cell);
        cell.alignment = { vertical: "middle", horizontal: ci === 1 ? "left" : "right" };
        if (ci >= 7 && ci <= 15) cell.numFmt = MXN;
      });

      // Write this month to TOTALES sheet
      for (const tipo of TIPOS) {
        const t = totales[mes][tipo];
        if (t.total !== 0 || t.retenidos !== 0) {
          totalesMesRow(wsTot, mesLabel(mes), tipo, t);
        }
      }

      const keys = ["subtotal","iva8","iva16","retISR","retSegundo","retSecundaria","descuento","total","retenidos"] as const;
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
      sumaIngresos.descuento, sumaIngresos.retISR, sumaIngresos.retSegundo, sumaIngresos.retSecundaria, sumaIngresos.retenidos, sumaIngresos.total,
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
      sumaGastos.descuento, sumaGastos.retISR, sumaGastos.retSegundo, sumaGastos.retSecundaria, sumaGastos.retenidos, sumaGastos.total,
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
