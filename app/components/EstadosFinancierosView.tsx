'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import NotificationBell from './NotificationBell'
import type { ConceptoRow } from '@/lib/facturas-query'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)

const NUM = (v: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(v)

interface RfcOption { id: string; rfc: string; alias: string | null }

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

// ─── Tabla de conceptos ────────────────────────────────────────────────────────

function TablaConceptos({
  rows,
  loading,
  accent,
}: {
  rows: ConceptoRow[]
  loading: boolean
  accent: 'emerald' | 'rose'
}) {
  const spinColor = accent === 'emerald' ? 'text-emerald-500' : 'text-rose-500'
  const rankColor = accent === 'emerald'
    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
    : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-14 text-sm gap-2 ${spinColor} dark:opacity-80`}>
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
        </svg>
        Cargando…
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <p className="text-sm text-slate-400 dark:text-zinc-500">Sin datos para el periodo seleccionado</p>
      </div>
    )
  }

  const maxImporte = Math.max(...rows.map(r => Number(r.importe)), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-zinc-800 text-left">
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold w-8">#</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold">Descripción</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-center">Clave</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">Facturas</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">Cantidad</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">Subtotal</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">IVA 8%</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">IVA 16%</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold text-right">Total</th>
            <th className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-semibold w-36">Participación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((row, i) => {
            const pct = maxImporte > 0 ? (Number(row.importe) / maxImporte) * 100 : 0
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${rankColor}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-zinc-100 max-w-xs">
                  <span className="line-clamp-2">{row.descripcion}</span>
                </td>
                <td className="px-4 py-3 text-center text-slate-500 dark:text-zinc-400 font-mono">
                  {row.claveProdServ || '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-zinc-300">
                  {row.numFacturas}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-zinc-300">
                  {NUM(Number(row.cantidad))}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-zinc-100">
                  {MXN(Number(row.importe))}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-zinc-300">
                  {MXN(Number(row.iva8))}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-zinc-300">
                  {MXN(Number(row.iva16))}
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                  {MXN(Number(row.importe) + Number(row.iva8) + Number(row.iva16))}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${accent === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 w-8 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Vista principal ────────────────────────────────────────────────────────────

export default function EstadosFinancierosView({ session, accountType }: Props) {
  const now = new Date()
  const [rfcs,        setRfcs]        = useState<RfcOption[]>([])
  const [selectedRfc, setSelectedRfc] = useState<string>('')
  const [year,        setYear]        = useState(now.getFullYear())
  const [month,       setMonth]       = useState(now.getMonth() + 1)
  const [ingresos,    setIngresos]    = useState<ConceptoRow[]>([])
  const [egresos,     setEgresos]     = useState<ConceptoRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [exporting,   setExporting]   = useState(false)

  // Cargar RFCs al montar
  useEffect(() => {
    fetch('/api/rfcs').then(r => r.json()).then(d => {
      const list: RfcOption[] = d.rfcs ?? []
      setRfcs(list)
      if (list.length > 0) setSelectedRfc(list[0].rfc)
    }).catch(() => {})
  }, [])

  // Cargar datos al cambiar RFC / periodo
  const fetchData = useCallback(async (rfc: string, y: number, m: number) => {
    if (!rfc) return
    setLoading(true)
    setIngresos([])
    setEgresos([])
    try {
      const res = await fetch(
        `/api/estados-financieros/data?rfc=${encodeURIComponent(rfc)}&year=${y}&month=${m}`
      )
      if (res.ok) {
        const d = await res.json()
        setIngresos(d.ingresos ?? [])
        setEgresos(d.egresos ?? [])
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (selectedRfc) fetchData(selectedRfc, year, month)
  }, [selectedRfc, year, month, fetchData])

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

  async function handleExport() {
    if (!selectedRfc || exporting) return
    setExporting(true)
    try {
      const url = `/api/export/estados-financieros?rfc=${encodeURIComponent(selectedRfc)}&year=${year}&month=${month}`
      const res = await fetch(url)
      if (!res.ok) { alert('Error al generar el reporte'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `estados-financieros_${selectedRfc}_${String(month).padStart(2,'0')}-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Error al descargar') }
    finally { setExporting(false) }
  }

  const totIngresos = ingresos.reduce((s, r) => s + Number(r.importe) + Number(r.iva8) + Number(r.iva16), 0)
  const totEgresos  = egresos.reduce((s, r) => s + Number(r.importe) + Number(r.iva8) + Number(r.iva16), 0)

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} />
      <main className="flex-1 min-w-0 flex flex-col lg:ml-0">
        <div className="lg:hidden h-14" />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Estados Financieros</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Principales ingresos y egresos por producto o servicio</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* RFC selector */}
              {rfcs.length > 1 ? (
                <select
                  value={selectedRfc}
                  onChange={e => setSelectedRfc(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {rfcs.map(r => <option key={r.rfc} value={r.rfc}>{r.alias ? `${r.alias} (${r.rfc})` : r.rfc}</option>)}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide">
                  {rfcs[0]?.alias ? `${rfcs[0].alias} (${selectedRfc})` : selectedRfc}
                </span>
              ) : null}

              {/* Navegador de mes */}
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

              {/* Descargar Excel */}
              {selectedRfc && (
                <button
                  onClick={handleExport}
                  disabled={exporting || loading}
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

              <NotificationBell />
            </div>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">

          {!selectedRfc && !loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">Sin RFCs registrados</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Agrega un RFC en la sección RFCs.</p>
            </div>
          ) : (
            <>
              {/* ── KPI row ── */}
              {!loading && (ingresos.length > 0 || egresos.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/40 shadow-sm px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Total Ingresos (con IVA)</p>
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{MXN(totIngresos)}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">{ingresos.length} producto{ingresos.length !== 1 ? 's' : ''} / servicio{ingresos.length !== 1 ? 's' : ''}</p>
                    <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-1">* Parcial: primeros 20 conceptos. El Excel incluye el total completo.</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/40 shadow-sm px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">Total Egresos (con IVA)</p>
                    <p className="text-2xl font-black text-rose-700 dark:text-rose-300">{MXN(totEgresos)}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">{egresos.length} producto{egresos.length !== 1 ? 's' : ''} / servicio{egresos.length !== 1 ? 's' : ''}</p>
                    <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-1">* Parcial: primeros 20 conceptos. El Excel incluye el total completo.</p>
                  </div>
                </div>
              )}

              {/* ── Ingresos ── */}
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                      <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                        <polyline points="17 6 23 6 23 12"/>
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">Principales Ingresos</h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Por producto o servicio — facturas emitidas</p>
                    </div>
                  </div>
                  {!loading && ingresos.length > 0 && (
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {ingresos.length} conceptos
                    </span>
                  )}
                </div>
                <TablaConceptos rows={ingresos} loading={loading} accent="emerald" />
              </div>

              {/* ── Egresos ── */}
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/40">
                      <svg className="h-4 w-4 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                        <polyline points="17 18 23 18 23 12"/>
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">Principales Egresos</h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Por producto o servicio — facturas recibidas</p>
                    </div>
                  </div>
                  {!loading && egresos.length > 0 && (
                    <span className="rounded-full bg-rose-50 dark:bg-rose-900/30 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                      {egresos.length} conceptos
                    </span>
                  )}
                </div>
                <TablaConceptos rows={egresos} loading={loading} accent="rose" />
              </div>

              {/* Nota de vista previa */}
              {selectedRfc && (
                <div className="flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <span className="font-semibold">Vista previa:</span> se muestran hasta 20 conceptos por sección. El Excel incluye todos los registros del periodo.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DashboardFooter />
      </main>
    </div>
  )
}
