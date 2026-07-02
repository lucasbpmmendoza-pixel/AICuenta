'use client'

import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import { parseCfdiXml, detectClientRfc, CFDI_COLUMNS, type CfdiRow } from '@/lib/cfdi-xml'
import {
  saveDemoClientRfc,
  clearDemoClientRfc,
  readDemoClientRfc,
  saveDemoCuadroRows,
  readDemoCuadroRows,
  clearDemoCuadroRows,
  type DemoClientRfc,
} from '@/lib/demo-cuadros'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

const numFmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtCell(row: CfdiRow, key: keyof CfdiRow, numeric?: boolean): string {
  const v = row[key]
  if (numeric) return numFmt.format(Number(v) || 0)
  return v == null || v === '' ? '—' : String(v)
}

export default function DemoCuadrosView({ session, accountType }: Props) {
  const [rows, setRows] = useState<CfdiRow[]>([])
  const [invalidCount, setInvalidCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [clientRfc, setClientRfc] = useState<DemoClientRfc | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Espejo de `rows` para poder acumular sin cerrar sobre estado obsoleto.
  const rowsRef = useRef<CfdiRow[]>([])

  // Restaura el cuadro guardado para que sobreviva la navegación por la app.
  useEffect(() => {
    const saved = readDemoCuadroRows<CfdiRow>()
    if (saved.length > 0) {
      rowsRef.current = saved
      setRows(saved)
      setClientRfc(readDemoClientRfc())
    }
  }, [])

  // Fija las filas, las persiste, detecta el RFC del cliente (el más repetido) y
  // lo comparte con el Dashboard demo. Se llama solo desde handlers de eventos.
  const commitRows = useCallback((next: CfdiRow[]) => {
    rowsRef.current = next
    setRows(next)
    if (next.length === 0) {
      setClientRfc(null)
      clearDemoClientRfc()
      clearDemoCuadroRows()
      return
    }
    saveDemoCuadroRows(next)
    const detected = detectClientRfc(next)
    if (detected) {
      saveDemoClientRfc(detected)
      setClientRfc(detected)
    }
  }, [])

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setProcessing(true)
    const files = Array.from(fileList)
    const parsed: CfdiRow[] = []
    let invalid = 0
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith('.xml')) { invalid++; continue }
      try {
        const text = await f.text()
        const row = parseCfdiXml(text, f.name)
        if (row) parsed.push(row)
        else invalid++
      } catch { invalid++ }
    }
    if (parsed.length > 0) commitRows([...rowsRef.current, ...parsed])
    if (invalid > 0) setInvalidCount(c => c + invalid)
    setProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }, [commitRows])

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
  }

  function handleClear() {
    commitRows([])
    setInvalidCount(0)
  }

  async function handleExport() {
    if (rows.length === 0 || exporting) return
    setExporting(true)
    try {
      const mod = await import('exceljs')
      const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('CFDIs')
      ws.columns = CFDI_COLUMNS.map(c => ({ header: c.label, key: c.key as string, width: 18 }))
      ws.getRow(1).font = { bold: true }
      for (const r of rows) ws.addRow(r)
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `cuadro_cfdis_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      alert('No se pudo generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
      <main className="flex-1 min-w-0 flex flex-col lg:ml-60">
        <div className="lg:hidden h-14" />

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-[#7B6FE8] dark:text-[#91eb78]">Crea tus cuadros gratis</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                Arrastra tus XMLs de CFDI y descárgalos ordenados en Excel. Todo se procesa en tu navegador — nada se sube.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {rows.length > 0 && (
                <button
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={handleExport}
                disabled={rows.length === 0 || exporting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
              >
                {exporting ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                )}
                {exporting ? 'Generando…' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={[
              'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed cursor-pointer select-none transition-colors px-8 py-12',
              dragging
                ? 'border-[#7B6FE8] bg-[#EBE9FB] dark:border-[#91eb78] dark:bg-[#5E6957]/30'
                : 'border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:border-slate-400 dark:hover:border-zinc-500',
            ].join(' ')}
          >
            <input ref={inputRef} type="file" accept=".xml,text/xml,application/xml" multiple className="hidden" onChange={handleChange} />
            <span className="text-3xl text-slate-400 dark:text-zinc-500">&#8681;</span>
            <span className="text-sm text-slate-600 dark:text-zinc-300 text-center">
              Arrastra tus archivos <span className="font-semibold">.XML</span> aquí
              <br />
              o haz clic para seleccionarlos
            </span>
            {processing && (
              <span className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                Procesando…
              </span>
            )}
          </div>

          {/* Resumen: RFC detectado + conteos */}
          {(rows.length > 0 || invalidCount > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                {rows.length} CFDIs procesados
              </span>
              {invalidCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {invalidCount} archivo(s) no válido(s) omitido(s)
                </span>
              )}
              {clientRfc && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]/40 px-3 py-1 text-xs font-bold text-[#450c7d] dark:text-[#91eb78]">
                  RFC del cliente detectado: {clientRfc.rfc}
                  <span className="font-normal opacity-80">· se usará en tu Dashboard</span>
                </span>
              )}
            </div>
          )}

          {/* Cuadro plano */}
          {rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {CFDI_COLUMNS.map(c => (
                      <th key={c.key} className="whitespace-nowrap border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 text-left font-semibold text-slate-600 dark:text-zinc-300">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.uuid}_${i}`}>
                      {CFDI_COLUMNS.map(c => (
                        <td key={c.key} className={`whitespace-nowrap border border-slate-200 dark:border-zinc-800 px-3 py-1.5 text-slate-700 dark:text-zinc-200 ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                          {fmtCell(r, c.key, c.numeric)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DashboardFooter />
      </main>
    </div>
  )
}
