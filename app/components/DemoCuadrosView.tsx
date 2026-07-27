'use client'

import { useState, useEffect, useRef, useCallback, useMemo, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import { parseCfdiXml, detectClientRfc, CFDI_COLUMNS, type CfdiRow } from '@/lib/cfdi-xml'
import { buildFacturasFromCfdis } from '@/lib/cfdi-to-facturas'
import { buildClassifiedWorkbook } from '@/lib/cfdi-to-classified-xlsx'
import { consumeDownloadSlot, formatRetryAfter, DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_MINUTES } from '@/lib/client-download-limit'
import { useAuth } from './AuthProvider'
import {
  saveDemoClientRfc,
  clearDemoClientRfc,
  readDemoClientRfc,
  saveDemoCuadroRows,
  readDemoCuadroRows,
  clearDemoCuadroRows,
  type DemoClientRfc,
} from '@/lib/demo-cuadros'
import {
  TablaIngresos, TablaEgresos, TablaNomina, TablaRetenciones,
  TablaPagos, Tablaflujo, TablaNotasCredito,
} from './facturas-tables'
import FreemiumUpsellModal from './FreemiumUpsellModal'
import OneTimePurchaseModal from './OneTimePurchaseModal'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

type FTab = 'ingresos' | 'egresos' | 'nomina' | 'retenciones'

const TABS: { id: FTab; label: string; active: string; hover: string }[] = [
  { id: 'ingresos',    label: 'Ingresos',    active: 'border-emerald-500 text-emerald-700 dark:text-emerald-300', hover: 'hover:text-emerald-700 dark:hover:text-emerald-300' },
  { id: 'egresos',     label: 'Egresos',     active: 'border-amber-500 text-amber-700 dark:text-amber-300',       hover: 'hover:text-amber-700 dark:hover:text-amber-300' },
  { id: 'nomina',      label: 'Nómina',      active: 'border-violet-500 text-violet-700 dark:text-violet-300',    hover: 'hover:text-violet-700 dark:hover:text-violet-300' },
  { id: 'retenciones', label: 'Retenciones', active: 'border-red-500 text-red-700 dark:text-red-300',             hover: 'hover:text-red-700 dark:hover:text-red-300' },
]

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Sentinela para "ver todos los meses" en el selector de periodo.
const ALL_PERIODS = 0

function rowPeriod(fecha: string): { y: number; m: number } | null {
  if (!fecha || fecha.length < 7) return null
  const y = Number(fecha.slice(0, 4))
  const m = Number(fecha.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  return { y, m }
}

// Recorre recursivamente una entrada del sistema de archivos (archivo o carpeta)
// y acumula todos los archivos que encuentra. Permite arrastrar carpetas completas.
async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file((f) => resolve(f), () => resolve(null))
    })
    if (file) out.push(file)
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries((e) => resolve(e), () => resolve([]))
      })
      if (batch.length === 0) break
      for (const child of batch) await walkEntry(child, out)
    }
  }
}

async function collectFilesFromEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = []
  for (const entry of entries) await walkEntry(entry, out)
  return out
}

export default function DemoCuadrosView({ session, accountType }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  // Solo demo y freemium tienen limite en las descargas client-side. Los de pago
  // sin e.firma que caen aqui mientras la configuran no se limitan.
  const isRateLimited = session.isDemo || Boolean(user?.isFreemium)
  const isFreemium = !session.isDemo && Boolean(user?.isFreemium)
  const [showUpsell, setShowUpsell] = useState(false)
  // Freemium ya no ve el upsell de suscripcion para descargar el cuadro:
  // ahora paga $50 MXN por descarga suelta (compra one-time). El modal de
  // suscripcion queda como fallback para otras funciones bloqueadas.
  const [showBuyCuadro, setShowBuyCuadro] = useState(false)
  const now = new Date()
  const [rows, setRows] = useState<CfdiRow[]>([])
  const [invalidCount, setInvalidCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingClassified, setExportingClassified] = useState(false)
  const [clientRfc, setClientRfc] = useState<DemoClientRfc | null>(null)
  const [tab, setTab] = useState<FTab>('ingresos')
  // Periodo activo para clasificar los CFDIs en pantalla. `year=ALL_PERIODS` significa
  // "todos los meses" y muestra el cuadro completo (util para revisar de un vistazo).
  const [year,  setYear]  = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
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

  // Cuando cambia el numero de CFDIs cargados (subida nueva o limpieza), salta al
  // mes mas reciente con datos para que el contador no aterrice en un mes vacio.
  useEffect(() => {
    if (rows.length === 0) return
    let bestY = 0, bestM = 0
    for (const r of rows) {
      const p = rowPeriod(r.fecha)
      if (!p) continue
      if (p.y > bestY || (p.y === bestY && p.m > bestM)) { bestY = p.y; bestM = p.m }
    }
    if (bestY > 0) { setYear(bestY); setMonth(bestM) }
    // Depende solo del tamano — no queremos re-saltar cuando el usuario navega meses.
  }, [rows.length])

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

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return
    setProcessing(true)
    const parsed: CfdiRow[] = []
    let invalid = 0
    for (const f of files) {
      // En carpetas es normal que vengan archivos no-XML: se ignoran sin contarlos.
      if (!f.name.toLowerCase().endsWith('.xml')) continue
      try {
        const text = await f.text()
        const row = parseCfdiXml(text, f.name)
        if (row) parsed.push(row)
        else invalid++ // .xml que no es un CFDI válido
      } catch { invalid++ }
    }
    if (parsed.length > 0) commitRows([...rowsRef.current, ...parsed])
    if (invalid > 0) setInvalidCount(c => c + invalid)
    setProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }, [commitRows])

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const dt = e.dataTransfer
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < dt.items.length; i++) {
      const entry = dt.items[i]?.webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
    if (entries.length > 0) {
      collectFilesFromEntries(entries).then(handleFiles)
    } else {
      handleFiles(Array.from(dt.files))
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files ?? []))
  }

  function handleClear() {
    commitRows([])
    setInvalidCount(0)
  }

  // Filas filtradas por el periodo activo (mes/año). `year=ALL_PERIODS` muestra todo.
  const filteredRows = useMemo(() => {
    if (year === ALL_PERIODS) return rows
    return rows.filter(r => {
      const p = rowPeriod(r.fecha)
      return !!p && p.y === year && p.m === month
    })
  }, [rows, year, month])

  // Lista ordenada (desc) de periodos que aparecen en los CFDIs cargados. Se usa
  // para el selector: solo se ofrecen meses que efectivamente tienen datos.
  const availablePeriods = useMemo(() => {
    const seen = new Set<string>()
    const list: { y: number; m: number }[] = []
    for (const r of rows) {
      const p = rowPeriod(r.fecha)
      if (!p) continue
      const key = `${p.y}-${p.m}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push(p)
    }
    list.sort((a, b) => (b.y - a.y) || (b.m - a.m))
    return list
  }, [rows])

  // Clasificación en las estructuras de la app — SOLO para mostrar en pantalla.
  const fx = useMemo(() => buildFacturasFromCfdis(filteredRows, clientRfc?.rfc ?? ''), [filteredRows, clientRfc])

  const counts: Record<FTab, number> = {
    ingresos: fx.ingresos.length,
    egresos: fx.egresos.length,
    nomina: fx.nomina.length,
    retenciones: fx.retenciones.length,
  }

  // Chequea el rate limit compartido entre los dos botones. Devuelve true si se
  // puede proceder; false si ya se alcanzo el limite (y le avisa al usuario).
  function checkDownloadLimit(): boolean {
    if (!isRateLimited) return true
    const slot = consumeDownloadSlot()
    if (!slot.allowed) {
      alert(`Alcanzaste el limite de ${DOWNLOAD_LIMIT} descargas cada ${DOWNLOAD_WINDOW_MINUTES} minutos. Intenta en ${formatRetryAfter(slot.retryAfterSeconds)}.`)
      return false
    }
    return true
  }

  // Descarga el "cuadro AIcuenta": Excel con una pestaña por seccion clasificada
  // (Ingresos/Egresos/Nomina/Retenciones/Pagos/Flujo/Notas). Usa TODAS las filas
  // sin importar el filtro de mes activo — es el respaldo clasificado completo.
  async function handleExportClassified() {
    if (rows.length === 0 || exportingClassified) return
    if (session.isDemo) return
    if (!checkDownloadLimit()) return
    setExportingClassified(true)
    try {
      const nombreEmpresa = clientRfc?.nombre || clientRfc?.rfc || 'CFDIs'
      const blob = await buildClassifiedWorkbook(rows, clientRfc?.rfc ?? '', nombreEmpresa)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `cuadro_aicuenta_${clientRfc?.rfc || 'cfdis'}_${stamp}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      alert('No se pudo generar el cuadro clasificado')
    } finally {
      setExportingClassified(false)
    }
  }

  // Freemium: cada descarga del cuadro clasificado cuesta $50 MXN (one-time).
  // Si ya tienen una compra 'pagada' sin consumir la consumimos y descargamos;
  // si no, abrimos el modal de compra que lleva a Stripe Checkout.
  // (El Excel plano queda gratis: es el respaldo de bajo valor para engancharse.)
  const consumeAndExportRef = useRef(false)
  async function attemptFreemiumClassifiedExport() {
    if (rows.length === 0 || exportingClassified) return
    if (consumeAndExportRef.current) return
    consumeAndExportRef.current = true
    try {
      const check = await fetch('/api/billing/one-time?tipo=cuadro_download', {
        cache: 'no-store',
      })
      const body = (await check.json().catch(() => ({}))) as { available?: boolean }
      if (!check.ok || !body.available) {
        setShowBuyCuadro(true)
        return
      }
      const consume = await fetch('/api/billing/one-time/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'cuadro_download' }),
      })
      if (!consume.ok) {
        // 402 => otra pestaña la consumio; volver a ofrecer compra.
        setShowBuyCuadro(true)
        return
      }
      await handleExportClassified()
    } catch {
      alert('No se pudo verificar tu compra. Intenta de nuevo.')
    } finally {
      consumeAndExportRef.current = false
    }
  }

  // Al regresar del Stripe Checkout (?onetime=cuadro) intentamos consumir + descargar
  // automaticamente. Solo aplica para freemium; corre una vez tras cargar las filas.
  const autoDownloadDoneRef = useRef(false)
  useEffect(() => {
    if (!isFreemium) return
    if (autoDownloadDoneRef.current) return
    if (rows.length === 0) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('onetime') !== 'cuadro') return
    autoDownloadDoneRef.current = true
    // Limpia el query param para no reintentar en un refresh.
    params.delete('onetime')
    const clean = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
    window.history.replaceState({}, '', clean)
    attemptFreemiumClassifiedExport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreemium, rows.length])

  // La DESCARGA junta todos los CFDIs en un solo Excel plano (una hoja, sin
  // clasificar). La clasificación exportable es la función de pago.
  async function handleExport() {
    if (rows.length === 0 || exporting) return
    if (!checkDownloadLimit()) return
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
              <h1 className="text-lg font-bold text-[#7B6FE8] dark:text-[#91eb78]">
                {session.isDemo ? 'Crea tus cuadros gratis' : 'Sube tus CFDIs'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                {session.isDemo
                  ? 'Sube tus XMLs de CFDI (o carpetas) y velos clasificados como en AICuenta. Todo se procesa en tu navegador — nada se sube.'
                  : 'Mientras configuras tu e.firma, sube tus XMLs (o carpetas) y con ellos se arman tu Dashboard y Estados Financieros. Se procesan en tu navegador.'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Volver a Facturas / demos — simétrico a la opción "Sube tus XMLs" del selector de Facturas.
                  En demo, /dashboard/facturas muestra esta misma vista (el hook), así que
                  forzamos ?view=facturas para llegar al FacturasView con datos demo. */}
              <button
                onClick={() => router.push(session.isDemo ? '/dashboard/facturas?view=facturas' : '/dashboard/facturas')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
              >
                ← Volver a Facturas
              </button>
              {/* Selector de mes: solo salen los periodos que traen CFDIs cargados,
                  más "Todos los meses" para ver el cuadro completo. */}
              {availablePeriods.length > 0 && (
                <select
                  value={year === ALL_PERIODS ? 'all' : `${year}-${month}`}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'all') { setYear(ALL_PERIODS); setMonth(1); return }
                    const [y, m] = v.split('-').map(Number)
                    setYear(y); setMonth(m)
                  }}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#7B6FE8]"
                >
                  <option value="all">Todos los meses ({rows.length})</option>
                  {availablePeriods.map(p => (
                    <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>
                      {MESES[p.m - 1]} {p.y}
                    </option>
                  ))}
                </select>
              )}
              {rows.length > 0 && (
                <button
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  Limpiar
                </button>
              )}
              {/* Cuadro AIcuenta: Excel clasificado por pestañas (nuestro formato).
                  Demo → /register. Freemium → upsell modal (misma razón: es
                  formato de pago). Pago sin e.firma sí puede descargarlo.
                  Se usa siempre <button> para no cambiar el tag entre server
                  y cliente (evita mismatch). */}
              <button
                onClick={() => {
                  if (session.isDemo) { window.location.assign('/register'); return }
                  if (isFreemium) { attemptFreemiumClassifiedExport(); return }
                  handleExportClassified()
                }}
                disabled={!session.isDemo && !isFreemium && (rows.length === 0 || exportingClassified)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white dark:text-zinc-900 transition"
                title={session.isDemo
                  ? 'El cuadro clasificado por pestañas está disponible al crear tu cuenta'
                  : isFreemium
                    ? 'El cuadro clasificado por pestañas está disponible solo en planes de pago'
                    : 'Descarga el cuadro clasificado por pestañas (Ingresos, Egresos, Nómina, Retenciones, Pagos, Flujo, Notas)'}
              >
                {exportingClassified ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                ) : (session.isDemo || isFreemium) ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>
                )}
                {exportingClassified ? 'Generando…' : 'Descargar cuadro AIcuenta'}
              </button>
              <button
                onClick={handleExport}
                disabled={rows.length === 0 || exporting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
                title="Descarga todos los CFDIs en un solo Excel plano (respaldo, sin clasificar)"
              >
                {exporting ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                )}
                {exporting ? 'Generando…' : 'Descargar Excel plano'}
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
            <input
              ref={(el) => {
                folderInputRef.current = el
                if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') }
              }}
              type="file"
              multiple
              className="hidden"
              onChange={handleChange}
            />
            <span className="text-3xl text-slate-400 dark:text-zinc-500">&#8681;</span>
            <span className="text-sm text-slate-600 dark:text-zinc-300 text-center">
              Arrastra tus archivos <span className="font-semibold">.XML</span> o una <span className="font-semibold">carpeta</span> aquí
              <br />
              o haz clic para seleccionar archivos
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Seleccionar carpeta
            </button>
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
                {year === ALL_PERIODS
                  ? `${rows.length} CFDIs procesados`
                  : `${filteredRows.length} CFDIs en ${MESES[month - 1]} ${year} · ${rows.length} totales`}
              </span>
              {invalidCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {invalidCount} archivo(s) no válido(s) omitido(s)
                </span>
              )}
              {clientRfc && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]/40 px-3 py-1 text-xs font-bold text-[#450c7d] dark:text-[#91eb78]">
                  RFC del cliente detectado: {clientRfc.rfc}
                  <span className="font-normal opacity-80">
                    {session.isDemo ? '· se usará en tu Dashboard' : '· alimenta tu Dashboard y Estados Financieros'}
                  </span>
                </span>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Aviso: la clasificación exportable es la función de pago */}
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  {session.isDemo ? (
                    <>Así clasifica AICuenta tus CFDIs. La <span className="font-semibold">descarga gratuita</span> junta todos tus XML en un solo Excel; la clasificación en este formato está disponible al registrarte.</>
                  ) : (
                    <>Así clasifica AICuenta tus CFDIs; con ellos se arman tu <span className="font-semibold">Dashboard</span> y <span className="font-semibold">Estados Financieros</span>. La descarga junta todos tus XML en un solo Excel.</>
                  )}
                </p>
              </div>

              {/* Ingresos / Egresos / Nómina / Retenciones (pestañas, como en la app) */}
              <div className="mt-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 dark:border-zinc-800 flex overflow-x-auto">
                  {TABS.map(t => {
                    const activeTab = tab === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`border-b-2 font-semibold text-sm px-4 py-2.5 transition ${
                          activeTab ? t.active : `border-transparent text-slate-500 dark:text-zinc-400 ${t.hover}`
                        }`}
                      >
                        {t.label}
                        <span className="ml-2 rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-bold text-slate-600 dark:text-zinc-300">
                          {counts[t.id]}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="overflow-x-auto">
                  {tab === 'ingresos' && <TablaIngresos rows={fx.ingresos} />}
                  {tab === 'egresos' && <TablaEgresos rows={fx.egresos} />}
                  {tab === 'nomina' && <TablaNomina rows={fx.nomina} />}
                  {tab === 'retenciones' && <TablaRetenciones rows={fx.retenciones} />}
                </div>
              </div>

              {/* Pagos */}
              <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-sm font-bold text-teal-700 dark:text-teal-300">Pagos</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Complementos de pago (TipoComprobante P)</p>
                  </div>
                  <span className="rounded-full bg-teal-50 dark:bg-teal-900/30 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                    {fx.pagos.length} registros
                  </span>
                </div>
                <div className="overflow-x-auto w-full">
                  <TablaPagos rows={fx.pagos} loading={false} />
                </div>
              </div>

              {/* Flujo de efectivo */}
              <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-sm font-bold text-sky-700 dark:text-sky-300">Flujo de efectivo</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Complementos de pago (P) + Facturas PUE</p>
                  </div>
                  <span className="rounded-full bg-sky-50 dark:bg-sky-900/30 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                    {fx.flujo.length} registros
                  </span>
                </div>
                <div className="w-full">
                  <Tablaflujo rows={fx.flujo} loading={false} />
                </div>
              </div>

              {/* Notas de crédito */}
              <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-sm font-bold text-orange-700 dark:text-orange-300">Notas de Crédito</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">CFDIs de tipo Egreso (E)</p>
                  </div>
                  <span className="rounded-full bg-orange-50 dark:bg-orange-900/30 px-2.5 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-300">
                    {fx.notas.length} registros
                  </span>
                </div>
                <div className="overflow-x-auto w-full">
                  <TablaNotasCredito rows={fx.notas} loading={false} />
                </div>
              </div>
            </>
          )}
        </div>
        <DashboardFooter />
      </main>

      <FreemiumUpsellModal
        open={showUpsell}
        onClose={() => setShowUpsell(false)}
        featureName="Descargar cuadro AIcuenta"
      />

      <OneTimePurchaseModal
        open={showBuyCuadro}
        onClose={() => setShowBuyCuadro(false)}
        tipo="cuadro_download"
        title="Descargar cuadro AICuenta"
        description="Descarga el Excel con una pestaña por sección clasificada (Ingresos, Egresos, Nómina, Retenciones, Pagos, Flujo, Notas). El pago es único, por esta descarga."
        priceLabel="$50 MXN"
        ctaLabel="Pagar $50 y descargar"
      />
    </div>
  )
}
