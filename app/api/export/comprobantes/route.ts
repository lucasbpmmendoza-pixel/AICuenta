import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from '@/lib/freemium'

export const dynamic = 'force-dynamic'

const HEADERS = [
  'ID', 'Remitente', 'Teléfono', 'Banco', 'Fecha', 'Monto',
  'Folio', 'Concepto', 'Referencia', 'Clave Rastreo',
  'Beneficiario', 'Cuenta Destino', 'Fuente', 'Registrado',
]

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0 }

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (await isFreemiumOwner(session)) return new Response(FREEMIUM_FORBIDDEN_MESSAGE, { status: 403 })

  const ownerId = session.ownerId ?? session.sub

  // Optional date range filters
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') // YYYY-MM-DD
  const to   = searchParams.get('to')   // YYYY-MM-DD

  try {
    const db = await getDb()
    const req2 = db.request().input('owner_id', ownerId)

    let whereExtra = ''
    if (from) { req2.input('from', new Date(from)); whereExtra += ' AND created_at >= @from' }
    if (to)   { req2.input('to',   new Date(to));   whereExtra += ' AND created_at < DATEADD(day,1,@to)' }

    const result = await req2.query(`
      SELECT
        id, remitente_nombre, remitente_telefono, banco, fecha, monto,
        folio, concepto, referencia, clave_rastreo, beneficiario, cuenta_destino,
        Fuente AS fuente, created_at
      FROM dbo.Comprobantes
      WHERE owner_id = @owner_id${whereExtra}
      ORDER BY created_at DESC
    `)
    const rows = result.recordset

    // ── Build workbook ─────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook()
    wb.creator = 'AICuenta'
    wb.created = new Date()

    const ws = wb.addWorksheet('Comprobantes')

    // Title row
    ws.mergeCells(1, 1, 1, HEADERS.length)
    const titleCell = ws.getCell('A1')
    titleCell.value = 'Comprobantes de Pago'
    titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    ws.getRow(1).height = 24

    // Header row
    const headerRow = ws.addRow(HEADERS)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF595959' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      }
    })
    ws.getRow(2).height = 18

    // Column widths
    const WIDTHS = [8, 22, 16, 16, 14, 14, 16, 30, 18, 24, 22, 16, 12, 18]
    WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    // Data rows
    const MXN = '"$"#,##0.00'
    const DATE_FMT = 'dd/mm/yyyy hh:mm'
    let totalMonto = 0

    rows.forEach((r, idx) => {
      const row = ws.addRow([
        r.id,
        r.remitente_nombre ?? '',
        r.remitente_telefono ?? '',
        r.banco ?? '',
        r.fecha ?? '',
        n(r.monto),
        r.folio ?? '',
        r.concepto ?? '',
        r.referencia ?? '',
        r.clave_rastreo ?? '',
        r.beneficiario ?? '',
        r.cuenta_destino ?? '',
        r.fuente ?? '',
        r.created_at ? new Date(r.created_at) : '',
      ])

      // Alternate row shading
      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF5F5F5'
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { vertical: 'middle' }
      })

      // Monto — currency format
      const montoCell = row.getCell(6)
      montoCell.numFmt = MXN
      montoCell.alignment = { horizontal: 'right', vertical: 'middle' }

      // Date format on created_at
      const dateCell = row.getCell(14)
      if (r.created_at) dateCell.numFmt = DATE_FMT

      totalMonto += n(r.monto)
    })

    // Totals row
    const totRow = ws.addRow([
      '', 'TOTAL', '', '', '', totalMonto,
      '', '', '', '', '', '', '', '',
    ])
    totRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
      cell.alignment = { vertical: 'middle' }
    })
    totRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
    const totMontoCell = totRow.getCell(6)
    totMontoCell.numFmt = MXN
    totMontoCell.alignment = { horizontal: 'right', vertical: 'middle' }

    // Freeze header rows
    ws.views = [{ state: 'frozen', ySplit: 2 }]

    // ── Stream buffer ──────────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const safeName = `Comprobantes_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new Response(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[export/comprobantes]', (err as Error).message)
    return new Response('Error al generar Excel', { status: 500 })
  }
}
