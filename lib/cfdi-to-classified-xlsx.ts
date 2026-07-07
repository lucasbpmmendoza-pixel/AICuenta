// Genera el Excel "cuadro AIcuenta" en el MISMO formato que el export oficial de
// app/api/export/facturas/route.ts (hoja TOTALES + una hoja por mes con secciones
// INGRESOS/GASTOS/GASTOS - NOMINA + hoja RETENCIONES), pero a partir de los CFDIs
// que el usuario subio en "Crea tus cuadros" — corre 100% en el navegador.
//
// Diferencias inevitables respecto al export server-side:
//   - `RegimenFiscalReceptor` no viene en el XML del comprobante, va vacio.
//   - `retSecundaria` de nomina no se separa (el parser solo saca ISR e IMSS).
import type ExcelJS from 'exceljs'
import type { CfdiRow } from './cfdi-xml'

// ─── Constantes: mismos codigos y colores que route.ts ───────────────────────
const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const TIPOS = ['INGRESOS','GASTOS','GASTOS - NOMINA'] as const
type Tipo = typeof TIPOS[number]

const C = {
  HEADER_BG: '595959',
  AZUL:      '1F4E79',
  GRIS:      '595959',
  VERDE:     '2E7D32',
  GRISCLARO: 'E8E8E8',
  AMARILLO:  'FFFF00',
}

const MXN = '"$"#,##0.00'

const TABLE_HEADERS = [
  'Fecha', 'Folio', 'Emisor', 'Régimen Emisor', 'Receptor', 'Régimen Receptor',
  'Subtotal', 'IVA 8%', 'IVA 16%', 'Total Trasladados', 'Retencion ISR', 'Retencion IMSS', 'Retencion Secundaria', 'Descuento', 'Total',
  'Moneda', 'Clasificación', 'Comprobante', 'Forma pago', 'Método Pago', 'Uso CFDI',
]
const COL_MAIN = TABLE_HEADERS.length
const COL_WIDTHS_MAIN = [13, 38, 18, 17, 16, 13, 13, 13, 13, 18, 13, 14, 14, 13, 13, 10, 13, 13, 22, 13, 10]

const TOT_HEADERS = ['Mes', 'Tipo', 'Subtotal', 'IVA 8', 'IVA 16', 'IVA Total', 'Descuento', 'Ret ISR', 'Ret IMSS', 'Ret Secundaria', 'Total Retenciones', 'Total']
const COL_TOT = TOT_HEADERS.length
const COL_WIDTHS_TOT = [22, 22, 14, 13, 13, 13, 13, 13, 14, 14, 18, 14]

const RET_HEADERS = ['RFC Emisor', 'Régimen Emisor', 'RFC Receptor', 'Régimen Receptor', 'Clasificación', 'Subtotal', 'IVA 8%', 'IVA 16%', 'Total Trasladados', 'Ret ISR', 'Ret IMSS', 'Ret Secundaria', 'Ret Total', 'Descuento', 'Total', 'Mes']
const COL_RET = RET_HEADERS.length
const COL_WIDTHS_RET = [16, 20, 16, 20, 22, 14, 13, 13, 16, 13, 14, 14, 16, 13, 14, 16]

// ─── Traductores SAT (mismos que route.ts) ────────────────────────────────────
function tipoCFDILabel(t: string): string {
  return (({ I: 'Ingreso', E: 'Egreso', N: 'Nómina', P: 'Pago', T: 'Traslado', R: 'Retención' }) as Record<string,string>)[t] ?? t
}
function formaDePagoLabel(c: string): string {
  const m: Record<string,string> = {
    '01': 'Efectivo', '02': 'Cheque nominativo', '03': 'Transferencia electrónica',
    '04': 'Tarjeta de crédito', '05': 'Monedero electrónico', '06': 'Dinero electrónico',
    '08': 'Vales de despensa', '28': 'Tarjeta de débito', '29': 'Tarjeta de servicios',
    '30': 'Aplicación de anticipos', '99': 'Por definir',
  }
  return m[c] ?? c
}

function mesKey(fecha: Date): string {
  const y = fecha.getUTCFullYear()
  const m = fecha.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}
function mesLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y}-${MESES_ES[parseInt(m) - 1]}`
}
function mesLabelLong(key: string): string {
  const [y, m] = key.split('-')
  return `${MESES_ES[parseInt(m) - 1]} ${y}`
}

// ─── Totales ──────────────────────────────────────────────────────────────────
interface Totales {
  subtotal: number; iva8: number; iva16: number;
  retISR: number; retSegundo: number; retSecundaria: number; descuento: number;
  total: number; retenidos: number;
}
function resetTotales(): Totales {
  return { subtotal: 0, iva8: 0, iva16: 0, retISR: 0, retSegundo: 0, retSecundaria: 0, descuento: 0, total: 0, retenidos: 0 }
}

type RowTuple = [string, string, string, string, string, string, number, number, number, number, number, number, number, number, number, string, string, string, string, string, string]
type RetTuple = [string, string, string, string, string, number, number, number, number, number, number, number, number, number, number, string]

/**
 * Genera el workbook clasificado (formato oficial) a partir de los CFDIs parseados.
 * Devuelve el Blob del .xlsx listo para descargar.
 *
 * @param rows      Filas parseadas por parseCfdiXml
 * @param clientRfc RFC del cliente (para decidir emisor/receptor => INGRESO/EGRESO)
 * @param nombreEmpresa Titulo del encabezado (razon social o RFC del cliente)
 */
export async function buildClassifiedWorkbook(
  rows: CfdiRow[],
  clientRfc: string,
  nombreEmpresa: string,
): Promise<Blob> {
  // Import dinamico para no meter exceljs en el bundle inicial.
  const mod = await import('exceljs')
  const ExcelJSRt = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS)

  const THIN_BORDER: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
  const BORDER_ALL: Partial<ExcelJS.Borders> = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER }

  function addBorder(cell: ExcelJS.Cell) { cell.border = BORDER_ALL }
  function setFill(cell: ExcelJS.Cell, hex: string) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }
  }

  function companyHeader(ws: ExcelJS.Worksheet, nombre: string, colCount: number) {
    const row = ws.addRow([nombre])
    row.height = 20
    const cell = row.getCell(1)
    cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    setFill(cell, C.HEADER_BG)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    addBorder(cell)
    ws.mergeCells(row.number, 1, row.number, colCount)
  }

  function plainHeaderRow(ws: ExcelJS.Worksheet, headers: string[]) {
    const row = ws.addRow(headers)
    row.font = { bold: true }
    row.eachCell({ includeEmpty: true }, (cell) => {
      addBorder(cell)
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
  }

  function sectionTitle(ws: ExcelJS.Worksheet, tipo: Tipo) {
    const bg = tipo === 'INGRESOS' ? C.AZUL : tipo === 'GASTOS' ? C.GRIS : C.VERDE
    const row = ws.addRow([tipo])
    row.height = 20
    const cell = row.getCell(1)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    setFill(cell, bg)
    cell.alignment = { vertical: 'middle' }
    ws.mergeCells(row.number, 1, row.number, COL_MAIN)
  }

  function tableHeaderRow(ws: ExcelJS.Worksheet) { plainHeaderRow(ws, TABLE_HEADERS) }

  function addDataRow(ws: ExcelJS.Worksheet, r: RowTuple) {
    const fp = r[18] as string
    const esEfectivo = fp === 'Efectivo'
    const row = ws.addRow(r)
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell)
      if (ci >= 7 && ci <= 15) cell.numFmt = MXN
      if (esEfectivo) setFill(cell, C.AMARILLO)
    })
  }

  function sectionTotalsRow(ws: ExcelJS.Worksheet, tipo: Tipo, t: Totales) {
    const bg = tipo === 'INGRESOS' ? C.AZUL : tipo === 'GASTOS' ? C.GRIS : C.VERDE
    ws.addRow([])
    const row = ws.addRow([
      '', '', '', '', '', 'TOTALES',
      t.subtotal, t.iva8, t.iva16, t.iva8 + t.iva16,
      t.retISR, t.retSegundo, t.retSecundaria, t.descuento, t.total,
    ])
    row.font = { bold: true }
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell)
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
      if (ci >= 7 && ci <= 15) cell.numFmt = MXN
      if (ci >= 7) {
        setFill(cell, bg)
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })
  }

  function totalesMesRow(wsTot: ExcelJS.Worksheet, label: string, tipo: Tipo, t: Totales) {
    const row = wsTot.addRow([
      label, tipo,
      t.subtotal, t.iva8, t.iva16, t.iva8 + t.iva16,
      t.descuento, t.retISR, t.retSegundo, t.retSecundaria, t.retenidos, t.total,
    ])
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell)
      cell.alignment = { vertical: 'middle', horizontal: ci <= 2 ? 'left' : 'right' }
      if (ci >= 3) cell.numFmt = MXN
    })
  }

  // ─── Bucket rows por mes y tipo ────────────────────────────────────────────
  const rfc = (clientRfc || '').toUpperCase()
  const totales: Record<string, Record<Tipo, Totales>> = {}
  const buffers: Record<string, Record<Tipo, RowTuple[]>> = {}
  const retencionesRows: RetTuple[] = []

  for (const r of rows) {
    const tc = r.tipoCambio || 1

    // Solo procesamos Ingresos y Nomina que involucren al RFC del cliente. Otros
    // tipos (P, R, E, T) no van a las hojas mensuales — igual que en el server.
    const esEmisor = !rfc || r.rfcEmisor === rfc
    const esReceptor = !!rfc && r.rfcReceptor === rfc

    let mov: 'INGRESO' | 'EGRESO'
    let tipo: Tipo
    if (r.tipo === 'N') {
      // Nomina: si el cliente es emisor (patron) => GASTOS - NOMINA; si es receptor
      // (empleado) => INGRESOS.
      if (esEmisor && !esReceptor)      { mov = 'EGRESO';  tipo = 'GASTOS - NOMINA' }
      else if (esReceptor)              { mov = 'INGRESO'; tipo = 'INGRESOS' }
      else                              continue
    } else if (r.tipo === 'I') {
      if (esEmisor && !esReceptor)      { mov = 'INGRESO'; tipo = 'INGRESOS' }
      else if (esReceptor)              { mov = 'EGRESO';  tipo = 'GASTOS' }
      else                              continue
    } else {
      continue
    }

    const fecha = new Date(r.fecha)
    if (isNaN(fecha.getTime())) continue
    const mes = mesKey(fecha)

    if (!buffers[mes]) {
      totales[mes] = { INGRESOS: resetTotales(), GASTOS: resetTotales(), 'GASTOS - NOMINA': resetTotales() }
      buffers[mes] = { INGRESOS: [], GASTOS: [], 'GASTOS - NOMINA': [] }
    }

    const dd = String(fecha.getUTCDate()).padStart(2, '0')
    const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = fecha.getUTCFullYear()

    const subtotal   = r.subtotal * tc
    const iva8       = r.iva8 * tc
    const iva16      = r.iva16 * tc
    const totalTras  = r.totalTraslados * tc
    // Nomina: ISR viene de deducciones (nominaIsr), IMSS = nominaImss, secundaria = 0.
    // El descuento del comprobante en nomina suele traer el total de deducciones,
    // asi que se deja como esta.
    const retISR       = (r.tipo === 'N' ? r.nominaIsr  : r.retIsr) * tc
    const retSegundo   = (r.tipo === 'N' ? r.nominaImss : r.retIva) * tc
    const retSecundaria = 0
    const descuento    = r.descuento * tc
    const total        = r.total * tc
    const fp           = formaDePagoLabel(r.formaPago)

    buffers[mes][tipo].push([
      `${dd}/${mm}/${yyyy}`, r.uuid,
      r.rfcEmisor, r.regimenEmisor,
      r.rfcReceptor, '', // regimen receptor no viene en el XML
      subtotal, iva8, iva16, totalTras,
      retISR, retSegundo, retSecundaria, descuento, total,
      r.moneda, mov,
      tipoCFDILabel(r.tipo), fp,
      r.metodoPago, r.usoCFDI,
    ])

    const t = totales[mes][tipo]
    t.subtotal += subtotal
    t.iva8 += iva8
    t.iva16 += iva16
    t.retISR += retISR
    t.retSegundo += retSegundo
    t.retSecundaria += retSecundaria
    t.descuento += descuento
    t.total += total

    const totalRetencion = retISR + retSegundo + retSecundaria
    if (totalRetencion !== 0) {
      t.retenidos += totalRetencion
      retencionesRows.push([
        r.rfcEmisor, r.regimenEmisor,
        r.rfcReceptor, '',
        tipo,
        subtotal, iva8, iva16, totalTras,
        retISR, retSegundo, retSecundaria, totalRetencion,
        descuento, total,
        mesLabelLong(mes),
      ])
    }
  }

  // ─── Workbook ─────────────────────────────────────────────────────────────
  const wb = new ExcelJSRt.Workbook()
  wb.creator = 'AIcuenta'
  wb.created = new Date()

  // Hoja TOTALES primero
  const wsTot = wb.addWorksheet('TOTALES')
  wsTot.columns = COL_WIDTHS_TOT.map(w => ({ width: w }))
  companyHeader(wsTot, nombreEmpresa, COL_TOT)
  plainHeaderRow(wsTot, TOT_HEADERS)

  // Hojas mensuales
  const mesesArray = Object.keys(buffers).sort()
  const sumaIngresos = resetTotales()
  const sumaGastos = resetTotales()

  for (const mes of mesesArray) {
    const hasData = TIPOS.some(tp => buffers[mes][tp].length > 0)
    if (!hasData) continue

    const ws = wb.addWorksheet(mesLabel(mes))
    ws.columns = COL_WIDTHS_MAIN.map(w => ({ width: w }))
    companyHeader(ws, nombreEmpresa, COL_MAIN)
    ws.addRow([])

    for (const tipo of TIPOS) {
      const secRows = buffers[mes][tipo]
      if (!secRows || secRows.length === 0) continue

      sectionTitle(ws, tipo)
      tableHeaderRow(ws)

      secRows.sort((a, b) => {
        const [da, ma, ya] = (a[0] as string).split('/').map(Number)
        const [db, mb, yb] = (b[0] as string).split('/').map(Number)
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime()
      })

      if (tipo === 'GASTOS') {
        // Agrupar egresos por RFC emisor con subtotal, igual que el server.
        const byRFC: Record<string, { rows: RowTuple[]; tot: Totales }> = {}
        for (const rr of secRows) {
          const rfcEm = rr[2] as string
          if (!byRFC[rfcEm]) byRFC[rfcEm] = { rows: [], tot: resetTotales() }
          byRFC[rfcEm].rows.push(rr)
          const gt = byRFC[rfcEm].tot
          gt.subtotal += Number(rr[6])
          gt.iva8 += Number(rr[7])
          gt.iva16 += Number(rr[8])
          gt.retISR += Number(rr[10])
          gt.retSegundo += Number(rr[11])
          gt.retSecundaria += Number(rr[12])
          gt.descuento += Number(rr[13])
          gt.total += Number(rr[14])
        }
        for (const [rfcEm, grupo] of Object.entries(byRFC)) {
          grupo.rows.forEach(rr => addDataRow(ws, rr))
          const tRow = ws.addRow([
            `TOTAL: ${rfcEm}`, '', '', '', '', '',
            grupo.tot.subtotal, grupo.tot.iva8, grupo.tot.iva16, grupo.tot.iva8 + grupo.tot.iva16,
            grupo.tot.retISR, grupo.tot.retSegundo, grupo.tot.retSecundaria, grupo.tot.descuento, grupo.tot.total,
            '', '', '', '', '', '',
          ])
          ws.mergeCells(tRow.number, 1, tRow.number, 5)
          tRow.font = { bold: true }
          tRow.eachCell({ includeEmpty: true }, (cell, ci) => {
            setFill(cell, C.GRISCLARO)
            addBorder(cell)
            cell.alignment = { vertical: 'middle', horizontal: 'right' }
            if (ci >= 7 && ci <= 15) cell.numFmt = MXN
          })
        }
      } else {
        secRows.forEach(rr => addDataRow(ws, rr))
      }

      sectionTotalsRow(ws, tipo, totales[mes][tipo])
    }

    // TOTAL GENERAL MES
    const tIn = totales[mes]['INGRESOS']
    const tGa = totales[mes]['GASTOS']
    const tNo = totales[mes]['GASTOS - NOMINA']
    const tOut = {
      subtotal: tGa.subtotal + tNo.subtotal,
      iva8: tGa.iva8 + tNo.iva8,
      iva16: tGa.iva16 + tNo.iva16,
      retISR: tGa.retISR + tNo.retISR,
      retSegundo: tGa.retSegundo + tNo.retSegundo,
      retSecundaria: tGa.retSecundaria + tNo.retSecundaria,
      descuento: tGa.descuento + tNo.descuento,
      total: tGa.total + tNo.total,
    }
    const tgm = {
      subtotal: tIn.subtotal - tOut.subtotal,
      iva8: tIn.iva8 - tOut.iva8,
      iva16: tIn.iva16 - tOut.iva16,
      retISR: tIn.retISR - tOut.retISR,
      retSegundo: tIn.retSegundo - tOut.retSegundo,
      retSecundaria: tIn.retSecundaria - tOut.retSecundaria,
      descuento: tIn.descuento - tOut.descuento,
      total: tIn.total - tOut.total,
    }
    ws.addRow([])
    const tgRow = ws.addRow([
      'TOTAL GENERAL MES', '', '', '', '', '',
      tgm.subtotal, tgm.iva8, tgm.iva16, tgm.iva8 + tgm.iva16,
      tgm.retISR, tgm.retSegundo, tgm.retSecundaria, tgm.descuento, tgm.total,
      '', '', '', '', '', '',
    ])
    ws.mergeCells(tgRow.number, 1, tgRow.number, 6)
    tgRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    tgRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      setFill(cell, C.GRIS)
      addBorder(cell)
      cell.alignment = { vertical: 'middle', horizontal: ci === 1 ? 'left' : 'right' }
      if (ci >= 7 && ci <= 15) cell.numFmt = MXN
    })

    // Escribir mes en la hoja TOTALES (GASTOS + NOMINA combinado, como el server)
    const tGastosCombinado: Totales = {
      subtotal: tGa.subtotal + tNo.subtotal,
      iva8: tGa.iva8 + tNo.iva8,
      iva16: tGa.iva16 + tNo.iva16,
      retISR: tGa.retISR + tNo.retISR,
      retSegundo: tGa.retSegundo + tNo.retSegundo,
      retSecundaria: tGa.retSecundaria + tNo.retSecundaria,
      descuento: tGa.descuento + tNo.descuento,
      total: tGa.total + tNo.total,
      retenidos: tGa.retenidos + tNo.retenidos,
    }
    if (tIn.total !== 0 || tIn.retenidos !== 0) totalesMesRow(wsTot, mesLabel(mes), 'INGRESOS', tIn)
    if (tGastosCombinado.total !== 0 || tGastosCombinado.retenidos !== 0) totalesMesRow(wsTot, mesLabel(mes), 'GASTOS', tGastosCombinado)

    const keys = ['subtotal','iva8','iva16','retISR','retSegundo','retSecundaria','descuento','total','retenidos'] as const
    keys.forEach(k => {
      sumaIngresos[k] += tIn[k]
      sumaGastos[k] += tGa[k] + tNo[k]
    })
  }

  // Grand totals en TOTALES
  wsTot.addRow([])
  const siRow = wsTot.addRow([
    '', 'TOTAL INGRESOS',
    sumaIngresos.subtotal, sumaIngresos.iva8, sumaIngresos.iva16, sumaIngresos.iva8 + sumaIngresos.iva16,
    sumaIngresos.descuento, sumaIngresos.retISR, sumaIngresos.retSegundo, sumaIngresos.retSecundaria, sumaIngresos.retenidos, sumaIngresos.total,
  ])
  siRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  siRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    setFill(cell, C.AZUL)
    addBorder(cell)
    cell.alignment = { vertical: 'middle', horizontal: ci <= 2 ? 'left' : 'right' }
    if (ci >= 3) cell.numFmt = MXN
  })

  const sgRow = wsTot.addRow([
    '', 'TOTAL GASTOS Y NOMINA',
    sumaGastos.subtotal, sumaGastos.iva8, sumaGastos.iva16, sumaGastos.iva8 + sumaGastos.iva16,
    sumaGastos.descuento, sumaGastos.retISR, sumaGastos.retSegundo, sumaGastos.retSecundaria, sumaGastos.retenidos, sumaGastos.total,
  ])
  sgRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sgRow.eachCell({ includeEmpty: true }, (cell, ci) => {
    setFill(cell, C.GRIS)
    addBorder(cell)
    cell.alignment = { vertical: 'middle', horizontal: ci <= 2 ? 'left' : 'right' }
    if (ci >= 3) cell.numFmt = MXN
  })

  // Hoja RETENCIONES
  if (retencionesRows.length > 0) {
    const wsRet = wb.addWorksheet('RETENCIONES')
    wsRet.columns = COL_WIDTHS_RET.map(w => ({ width: w }))
    companyHeader(wsRet, nombreEmpresa, COL_RET)
    wsRet.addRow([])
    plainHeaderRow(wsRet, RET_HEADERS)
    for (const rr of retencionesRows) {
      const row = wsRet.addRow(rr)
      row.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell)
        if (ci >= 6 && ci <= 14) cell.numFmt = MXN
      })
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
