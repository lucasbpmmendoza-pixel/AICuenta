'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import type { IngresoCFDI, EgresoCFDI, NominaCFDI, RetencionCFDI, PagoRow, NotaCreditoRow, EfectivamentePagadoRow } from '@/lib/facturas-query'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface RfcOption { id: string; rfc: string }
interface FacturasData {
  ingresos: IngresoCFDI[]
  egresos: EgresoCFDI[]
  nomina: NominaCFDI[]
  retenciones: RetencionCFDI[]
}

type Tab = 'ingresos' | 'egresos' | 'nomina' | 'retenciones'

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)

const fmt = (d: Date | string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const uuid4 = (u: string) => `${u.slice(0,8)}…`

const badge = (s: string) =>
  s === 'Vigente'
    ? 'inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300'
    : 'inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

export default function FacturasView({ session, accountType }: Props) {
  const now = new Date()
  const [rfcs, setRfcs]               = useState<RfcOption[]>([])
  const [selectedRfc, setSelectedRfc] = useState<string>('')
  const [year,  setYear]              = useState(now.getFullYear())
  const [month, setMonth]             = useState(now.getMonth() + 1)
  const [data,  setData]              = useState<FacturasData | null>(null)
  const [loading, setLoading]         = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [tab, setTab]                 = useState<Tab>('ingresos')
  const [pagosData, setPagosData]         = useState<PagoRow[] | null>(null)
  const [loadingPagos, setLoadingPagos]   = useState(false)
  const [exportingPagos, setExportingPagos] = useState(false)
  const [notasData, setNotasData]             = useState<NotaCreditoRow[] | null>(null)
  const [loadingNotas, setLoadingNotas]       = useState(false)
  const [exportingNotas, setExportingNotas]   = useState(false)
  const [efectivamentePagadoData, setEfectivamentePagadoData]   = useState<EfectivamentePagadoRow[] | null>(null)
  const [loadingEfectivamente, setLoadingEfectivamente]         = useState(false)
  const [exportingEfectivamente, setExportingEfectivamente]     = useState(false)

  useEffect(() => {
    fetch('/api/rfcs').then(r => r.json()).then(d => {
      const list: RfcOption[] = d.rfcs ?? []
      setRfcs(list)
      if (list.length > 0) setSelectedRfc(list[0].rfc)
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async (rfc: string, y: number, m: number) => {
    if (!rfc) return
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`/api/facturas/data?rfc=${encodeURIComponent(rfc)}&year=${y}&month=${m}`)
      const d = await res.json()
      if (res.ok) setData(d)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (selectedRfc) fetchData(selectedRfc, year, month)
  }, [selectedRfc, year, month, fetchData])

  // Load pagos alongside facturas data
  useEffect(() => {
    if (!selectedRfc) return
    setPagosData(null)
    setLoadingPagos(true)
    fetch(`/api/pagos/data?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.pagos)) setPagosData(d.pagos) })
      .catch(() => {})
      .finally(() => setLoadingPagos(false))
  }, [selectedRfc, year, month])

  // Load notas de crédito alongside facturas data
  useEffect(() => {
    if (!selectedRfc) return
    setNotasData(null)
    setLoadingNotas(true)
    fetch(`/api/notas-credito/data?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.notas)) setNotasData(d.notas) })
      .catch(() => {})
      .finally(() => setLoadingNotas(false))
  }, [selectedRfc, year, month])

  // Load efectivamente pagado (tipo P + PUE)
  useEffect(() => {
    if (!selectedRfc) return
    setEfectivamentePagadoData(null)
    setLoadingEfectivamente(true)
    fetch(`/api/efectivamente-pagado/data?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.rows)) setEfectivamentePagadoData(d.rows) })
      .catch(() => {})
      .finally(() => setLoadingEfectivamente(false))
  }, [selectedRfc, year, month])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return
    setMonth(nm)
    if (month === 12) setYear(y => y + 1)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  async function handleExportNotas() {
    if (!selectedRfc || exportingNotas) return
    setExportingNotas(true)
    try {
      const url = `/api/export/notas-credito?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { alert('Error al generar el reporte'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `notas-credito_${selectedRfc}_${String(month).padStart(2,'0')}-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Error al descargar') }
    finally { setExportingNotas(false) }
  }

  async function handleExportEfectivamente() {
    if (!selectedRfc || exportingEfectivamente) return
    setExportingEfectivamente(true)
    try {
      const url = `/api/export/efectivamente-pagado?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { alert('Error al generar el reporte'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `efectivamente-pagado_${selectedRfc}_${String(month).padStart(2,'0')}-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Error al descargar') }
    finally { setExportingEfectivamente(false) }
  }

  async function handleExportPagos() {
    if (!selectedRfc || exportingPagos) return
    setExportingPagos(true)
    try {
      const url = `/api/export/pagos?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { alert('Error al generar el reporte'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pagos_${selectedRfc}_${String(month).padStart(2,'0')}-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Error al descargar') }
    finally { setExportingPagos(false) }
  }

  async function handleExport() {
    if (!selectedRfc || exporting) return
    setExporting(true)
    try {
      const url = `/api/export/facturas?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { alert('Error al generar el reporte'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `facturas_${selectedRfc}_${String(month).padStart(2,'0')}-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Error al descargar') }
    finally { setExporting(false) }
  }

  const counts = {
    ingresos:    data?.ingresos.length    ?? 0,
    egresos:     data?.egresos.length     ?? 0,
    nomina:      data?.nomina.length      ?? 0,
    retenciones: data?.retenciones.length ?? 0,
  }

  const TABS: { id: Tab; label: string; color: string }[] = [
    { id: 'ingresos',    label: 'Ingresos',    color: 'emerald' },
    { id: 'egresos',     label: 'Egresos',     color: 'amber'   },
    { id: 'nomina',      label: 'Nómina',      color: 'violet'  },
    { id: 'retenciones', label: 'Retenciones', color: 'red'     },
  ]

  const tabActive  = 'border-b-2 font-semibold text-sm px-4 py-2.5 transition'
  const tabNormal  = 'border-b-2 border-transparent font-semibold text-sm px-4 py-2.5 transition text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'

  function tabClass(t: Tab) {
    if (t !== tab) return tabNormal
    const colors: Record<Tab, string> = {
      ingresos:    'border-emerald-500 text-emerald-700 dark:text-emerald-300',
      egresos:     'border-amber-500 text-amber-700 dark:text-amber-300',
      nomina:      'border-violet-500 text-violet-700 dark:text-violet-300',
      retenciones: 'border-red-500 text-red-700 dark:text-red-300',
    }
    return `${tabActive} ${colors[t]}`
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} />
      <main className="flex-1 min-w-0 flex flex-col lg:ml-0">
        <div className="lg:hidden h-14" />

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Facturas</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Listado y exportación de CFDIs</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* RFC selector */}
              {rfcs.length > 1 ? (
                <select
                  value={selectedRfc}
                  onChange={e => setSelectedRfc(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {rfcs.map(r => <option key={r.rfc} value={r.rfc}>{r.rfc}</option>)}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide">
                  {selectedRfc}
                </span>
              ) : null}

              {/* Mes */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-1">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="px-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 min-w-[130px] text-center">
                  {MESES[month - 1]} {year}
                </span>
                <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              {/* Descargar Excel CFDIs */}
              {selectedRfc && (
                <button
                  onClick={handleExport}
                  disabled={exporting || loading || !data}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
                >
                  {exporting ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                  )}
                  {exporting ? 'Generando…' : 'Descargar Excel'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">

          {/* Leyenda informativa */}
          {selectedRfc && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <span className="font-semibold">Vista previa:</span> se muestran hasta 10 registros por tabla. La generación del Excel puede tardar algunos segundos dependiendo del volumen de datos — descárgalo para ver el reporte completo.
              </p>
            </div>
          )}

          {!selectedRfc && !loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">Sin RFCs registrados</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Agrega un RFC en la sección RFCs.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">

              {/* Tabs */}
              <div className="border-b border-slate-200 dark:border-zinc-800 flex overflow-x-auto">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} className={tabClass(t.id)}>
                    {t.label}
                    {!loading && data && (
                      <span className="ml-2 rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-bold text-slate-600 dark:text-zinc-300">
                        {counts[t.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    Cargando…
                  </div>
                ) : !data ? null : (
                  <>
                    {tab === 'ingresos' && <TablaIngresos rows={data.ingresos} />}
                    {tab === 'egresos'  && <TablaEgresos  rows={data.egresos}  />}
                    {tab === 'nomina'   && <TablaNomina   rows={data.nomina}   />}
                    {tab === 'retenciones' && <TablaRetenciones rows={data.retenciones} />}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Pagos (tabla separada) ─────────────────────────────────── */}
          {selectedRfc && (
            <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              {/* Pagos header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Pagos</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Complementos de pago (TipoComprobante P)</p>
                </div>
                <div className="flex items-center gap-2">
                  {!loadingPagos && pagosData && (
                    <span className="rounded-full bg-teal-50 dark:bg-teal-900/30 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                      {pagosData.length} registros
                    </span>
                  )}
                  <button
                    onClick={handleExportPagos}
                    disabled={exportingPagos || loadingPagos}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    {exportingPagos ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                    )}
                    {exportingPagos ? 'Generando…' : 'Descargar Pagos'}
                  </button>
                </div>
              </div>
              {/* Pagos table */}
              <div className="overflow-x-auto w-full">
                <TablaPagos rows={pagosData ?? []} loading={loadingPagos} />
              </div>
            </div>
          )}

          {/* ─── Efectivamente Pagado (tipo P + PUE) ────────────────────────── */}
          {selectedRfc && (
            <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Efectivamente pagado</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Complementos de pago (P) + Facturas PUE del período</p>
                </div>
                <div className="flex items-center gap-2">
                  {!loadingEfectivamente && efectivamentePagadoData && (
                    <span className="rounded-full bg-sky-50 dark:bg-sky-900/30 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                      {efectivamentePagadoData.length} registros
                    </span>
                  )}
                  <button
                    onClick={handleExportEfectivamente}
                    disabled={exportingEfectivamente || loadingEfectivamente}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    {exportingEfectivamente ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                    )}
                    {exportingEfectivamente ? 'Generando…' : 'Descargar Excel'}
                  </button>
                </div>
              </div>
              <div className="w-full">
                <TablaEfectivamentePagado rows={efectivamentePagadoData ?? []} loading={loadingEfectivamente} />
              </div>
            </div>
          )}

          {/* ─── Notas de Crédito (tabla separada) ───────────────────────────── */}
          {selectedRfc && (
            <div className="mt-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Notas de Crédito</h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">CFDIs de tipo Egreso (E) vigentes</p>
                </div>
                <div className="flex items-center gap-2">
                  {!loadingNotas && notasData && (
                    <span className="rounded-full bg-orange-50 dark:bg-orange-900/30 px-2.5 py-0.5 text-xs font-bold text-orange-700 dark:text-orange-300">
                      {notasData.length} registros
                    </span>
                  )}
                  <button
                    onClick={handleExportNotas}
                    disabled={exportingNotas || loadingNotas}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    {exportingNotas ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                    )}
                    {exportingNotas ? 'Generando…' : 'Descargar Notas'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto w-full">
                <TablaNotasCredito rows={notasData ?? []} loading={loadingNotas} />
              </div>
            </div>
          )}
        </div>
        <DashboardFooter />
      </main>
    </div>
  )
}

// ─── Sub-tables ───────────────────────────────────────────────────────────────

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-200 dark:border-zinc-700 first:pl-5 last:pr-5">
    {children}
  </th>
)
const TD = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <td className={`px-4 py-2.5 text-sm text-slate-700 dark:text-zinc-200 border-b border-slate-100 dark:border-zinc-800 first:pl-5 last:pr-5 ${right ? 'text-right tabular-nums' : ''}`}>
    {children}
  </td>
)

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-zinc-500">
        Sin registros para este período
      </td>
    </tr>
  )
}

const PREVIEW_LIMIT = 10
function LimitNote({ count, cols }: { count: number; cols: number }) {
  if (count <= PREVIEW_LIMIT) return null
  return (
    <tfoot>
      <tr>
        <td colSpan={cols} className="px-5 py-3 text-center text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-900/30">
          Vista previa limitada a {PREVIEW_LIMIT} registros — descarga el Excel para el reporte completo
        </td>
      </tr>
    </tfoot>
  )
}

function TablaIngresos({ rows }: { rows: IngresoCFDI[] }) {
  return (
    <table className="w-full min-w-[900px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Fecha</TH><TH>RFC Receptor</TH><TH>Razón Social</TH>
          <TH>Folio</TH><TH>Status</TH><TH>Moneda</TH><TH>Total</TH><TH>Total MXN</TH><TH>IVA Trasl.</TH><TH>ISR Ret.</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={11} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{r.RFC_Receptor}</span></TD>
            <TD><span className="max-w-[200px] truncate block">{r.RazonSocialReceptor || r.RFC_Receptor}</span></TD>
            <TD>{r.Serie}{r.Folio ? `-${r.Folio}` : ''}</TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD><span className="font-mono text-xs">{r.Moneda}</span></TD>
            <TD right>{MXN(Number(r.Total) || 0)}</TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.TotalTrasladado) || 0)}</TD>
            <TD right>{MXN(Number(r.TotalRetenidoISR) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={11} />
    </table>
  )
}

function TablaEgresos({ rows }: { rows: EgresoCFDI[] }) {
  return (
    <table className="w-full min-w-[700px]">
      <thead>
        <tr>
          <TH>RFC Emisor</TH><TH>Razón Social</TH><TH>Facturas</TH>
          <TH>Vigentes</TH><TH>Canceladas</TH><TH>Total MXN</TH><TH>IVA Acred.</TH><TH>ISR Ret.</TH><TH>IVA Ret.</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={9} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.RFC_Emisor}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs">{r.RFC_Emisor}</span></TD>
            <TD><span className="max-w-[220px] truncate block">{r.RazonSocialEmisor}</span></TD>
            <TD right>{r.NumFacturas}</TD>
            <TD right><span className="text-green-700 dark:text-green-300">{r.Vigentes}</span></TD>
            <TD right><span className="text-red-600 dark:text-red-400">{r.Canceladas}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.IVA_MXN) || 0)}</TD>
            <TD right>{MXN(Number(r.ISR_Retenido_MXN) || 0)}</TD>
            <TD right>{MXN(Number(r.IVA_Retenido_MXN) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={9} />
    </table>
  )
}

function TablaNomina({ rows }: { rows: NominaCFDI[] }) {
  return (
    <table className="w-full min-w-[860px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Tipo</TH><TH>Fecha</TH><TH>RFC Emisor</TH><TH>Razón Social Emisor</TH>
          <TH>RFC Receptor</TH><TH>Status</TH><TH>Total MXN</TH><TH>ISR Ret.</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={9} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>
              <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                {r.TipoNomina}
              </span>
            </TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{r.RFC_Emisor}</span></TD>
            <TD><span className="max-w-[180px] truncate block">{r.RazonSocialEmisor || r.RFC_Emisor}</span></TD>
            <TD><span className="font-mono text-xs">{r.RFC_Receptor}</span></TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.TotalRetenidoISR) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={9} />
    </table>
  )
}

function TablaRetenciones({ rows }: { rows: RetencionCFDI[] }) {
  return (
    <table className="w-full min-w-[900px]">
      <thead>
        <tr>
          <TH>UUID</TH><TH>Dir.</TH><TH>Tipo</TH><TH>Fecha</TH><TH>RFC Emisor</TH>
          <TH>Razón Social</TH><TH>Status</TH><TH>Total MXN</TH><TH>ISR Ret. MXN</TH><TH>IVA Ret. MXN</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
          <tr key={`${r.UUID}_${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
            <TD><span className="font-mono text-xs text-slate-400 dark:text-zinc-500">{uuid4(r.UUID)}</span></TD>
            <TD>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${r.Direccion === 'Emitida' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                {r.Direccion}
              </span>
            </TD>
            <TD><span className="font-mono text-xs">{r.TipoComprobante}</span></TD>
            <TD>{fmt(r.Fecha)}</TD>
            <TD><span className="font-mono text-xs">{r.RFC_Emisor}</span></TD>
            <TD><span className="max-w-[180px] truncate block">{r.RazonSocialEmisor || r.RFC_Emisor}</span></TD>
            <TD><span className={badge(r.Status)}>{r.Status}</span></TD>
            <TD right><span className="font-semibold">{MXN(Number(r.Total_MXN) || 0)}</span></TD>
            <TD right>{MXN(Number(r.ISR_MXN) || 0)}</TD>
            <TD right>{MXN(Number(r.IVA_Ret_MXN) || 0)}</TD>
          </tr>
        ))}
      </tbody>
      <LimitNote count={rows.length} cols={10} />
    </table>
  )
}

function TablaPagos({ rows, loading }: { rows: PagoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full">
      <thead>
        <tr>
          <TH>F. Emisión</TH><TH>F. Pago</TH>
          <TH>RFC Emisor</TH><TH>RFC Receptor</TH>
          <TH>Forma Pago</TH><TH>Moneda</TH><TH>Total Pago</TH>
          <TH>Parcialidad</TH>
          <TH>Saldo Anterior</TH><TH>Importe Pagado</TH><TH>Saldo Insoluto</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={11} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
          const tc = Number(r.tipoCambio) || 1
          return (
            <tr key={`${r.uuid_pago}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
              <TD>{fmt(r.fechaEmision)}</TD>
              <TD>{fmt(r.fechaPago)}</TD>
              <TD><span className="font-mono text-xs">{r.RFC_emisor}</span></TD>
              <TD><span className="font-mono text-xs">{r.RFC_receptor}</span></TD>
              <TD>{r.forma_pago}</TD>
              <TD><span className="font-mono text-xs">{r.moneda_pago}</span></TD>
              <TD right><span className="font-semibold">{MXN(Number(r.total_pago) * tc)}</span></TD>
              <TD right>{r.numParcialidad || '—'}</TD>
              <TD right>{MXN(Number(r.saldo_anterior) * tc)}</TD>
              <TD right>{MXN(Number(r.saldo_pagado) * tc)}</TD>
              <TD right>{MXN(Number(r.saldo_insoluto) * tc)}</TD>
            </tr>
          )
        })}
      </tbody>
      <LimitNote count={rows.length} cols={11} />
    </table>
  )
}

function TablaEfectivamentePagado({ rows, loading }: { rows: EfectivamentePagadoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full table-fixed">
      <colgroup><col className="w-36" /><col className="w-28" /><col className="w-28" /><col className="w-36" /><col /><col className="w-28" /><col className="w-32" /></colgroup>
      <thead>
        <tr>
          <TH>Fuente</TH><TH>F. Emisión</TH><TH>F. Pago</TH>
          <TH>RFC Receptor</TH><TH>Razón Social</TH>
          <TH>Forma Pago</TH><TH>Total</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={7} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
          const tc = Number(r.tipoCambio) || 1
          const isPago = r.fuente === 'Complemento P'
          return (
            <tr key={`${r.uuid}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
              <TD>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${isPago ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>
                  {r.fuente}
                </span>
              </TD>
              <TD>{fmt(r.fechaEmision)}</TD>
              <TD>{r.fechaPago ? fmt(r.fechaPago) : '—'}</TD>
              <TD><span className="font-mono text-xs">{r.RFC_receptor}</span></TD>
              <TD><span className="truncate block">{r.RazonSocialReceptor || r.RFC_receptor}</span></TD>
              <TD>{r.formaPago || '—'}</TD>
              <TD right><span className="font-semibold">{MXN(Number(r.total) * tc)}</span></TD>
            </tr>
          )
        })}
      </tbody>
      <LimitNote count={rows.length} cols={7} />
    </table>
  )
}

function TablaNotasCredito({ rows, loading }: { rows: NotaCreditoRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400 dark:text-zinc-500 gap-2">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
        Cargando…
      </div>
    )
  }
  return (
    <table className="w-full">
      <thead>
        <tr>
          <TH>Fecha</TH>
          <TH>RFC Emisor</TH><TH>RFC Receptor</TH>
          <TH>Subtotal</TH><TH>IVA 16%</TH><TH>Total Trasl.</TH>
          <TH>Ret. ISR</TH><TH>Ret. IVA</TH><TH>Total</TH>
          <TH>Moneda</TH><TH>Forma Pago</TH><TH>Método Pago</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow cols={12} /> : rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
          const tc = Number(r.tipoCambio) || 1
          return (
            <tr key={`${r.uuid}-${i}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
              <TD>{fmt(r.fecha)}</TD>
              <TD><span className="font-mono text-xs">{r.RFC_emisor}</span></TD>
              <TD><span className="font-mono text-xs">{r.RFC_receptor}</span></TD>
              <TD right>{MXN(Number(r.subtotal) * tc)}</TD>
              <TD right>{MXN(Number(r.iva16) * tc)}</TD>
              <TD right>{MXN(Number(r.totaltrasladados) * tc)}</TD>
              <TD right>{MXN(Number(r.retISR) * tc)}</TD>
              <TD right>{MXN(Number(r.retIVA) * tc)}</TD>
              <TD right><span className="font-semibold">{MXN(Number(r.total) * tc)}</span></TD>
              <TD><span className="font-mono text-xs">{r.Moneda}</span></TD>
              <TD>{r.TipoPago}</TD>
              <TD>{r.MetodoPago}</TD>
            </tr>
          )
        })}
      </tbody>
      <LimitNote count={rows.length} cols={12} />
    </table>
  )
}
