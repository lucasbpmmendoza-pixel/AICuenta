'use client'

import { Fragment, useEffect, useState } from 'react'
import { rfcDisplay } from '@/lib/rfc-aliases'

export type Veredicto = 'ok' | 'sospechoso' | 'incorrecto' | 'sin_catalogo'

export interface AuditCfdi {
  uuid: string
  serie: string
  folio: string
  fecha: string
  importe: number
  contraparte: string
}

export interface AuditItem {
  tipo: 'ingreso' | 'egreso'
  clave: string
  satDesc: string
  emisorDesc: string
  numConceptos: number
  importe: number
  veredicto: Veredicto
  razon: string
  cfdis: AuditCfdi[]
}

export interface AuditData {
  ok: true
  rfc: string
  periodo: string
  totalRevisados: number
  resumen: { ok: number; sospechoso: number; incorrecto: number; sin_catalogo: number }
  items: AuditItem[]
  giro: string[] | null
}

interface Props {
  rfc: string
  year: number
  month: number
  rfcAlias: string | null
  /** Si se provee, el modal omite la llamada al API y muestra estos datos (modo demo). */
  demoData?: AuditData
  onClose: () => void
}

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(v)

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; mensaje: string }
  | { kind: 'ready'; data: AuditData }

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-rose-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

const VEREDICTO_STYLE: Record<Veredicto, { bg: string; text: string; label: string; ring: string }> = {
  ok: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    label: 'OK',
  },
  sospechoso: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-800',
    label: 'Sospechoso',
  },
  incorrecto: {
    bg: 'bg-rose-50 dark:bg-rose-900/40',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-300 dark:ring-rose-700',
    label: 'Incorrecto',
  },
  sin_catalogo: {
    bg: 'bg-slate-100 dark:bg-zinc-800',
    text: 'text-slate-600 dark:text-zinc-300',
    ring: 'ring-slate-200 dark:ring-zinc-700',
    label: 'Sin catálogo',
  },
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(data: AuditData, rfcAlias: string | null) {
  const headers = [
    'Tipo','Clave SAT','Descripción SAT','Descripción Emisor','Veredicto','Razón',
    '# Conceptos','Importe grupo',
    'UUID (folio fiscal)','Serie','Folio','Fecha CFDI','Contraparte','Importe CFDI',
  ]
  // Las filas con alerta/incorrecto traen sus CFDIs: una línea por comprobante
  // para que el contador pueda ubicar cada uno. Las "ok" van en una sola línea.
  const rows: (string | number)[][] = []
  for (const r of data.items) {
    const base = [
      r.tipo, r.clave, r.satDesc, r.emisorDesc,
      VEREDICTO_STYLE[r.veredicto].label, r.razon,
      r.numConceptos, r.importe.toFixed(2),
    ]
    if (r.cfdis && r.cfdis.length > 0) {
      for (const c of r.cfdis) {
        rows.push([...base, c.uuid, c.serie, c.folio, c.fecha, c.contraparte, c.importe.toFixed(2)])
      }
    } else {
      rows.push([...base, '', '', '', '', '', ''])
    }
  }
  // BOM para que Excel respete UTF-8.
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const safeRfc = (rfcAlias ?? data.rfc).replace(/[^a-zA-Z0-9_-]/g, '_')
  a.download = `auditoria-conceptos_${safeRfc}_${data.periodo.replace('/','-')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function EstadosFinancierosAuditModal({ rfc, year, month, rfcAlias, demoData, onClose }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [filter, setFilter] = useState<'all' | 'alertas'>('alertas')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  useEffect(() => {
    let cancel = false
    setState({ kind: 'loading' })

    // Modo demo: sin llamada al API. Breve "carga" simulada para que se sienta real.
    if (demoData) {
      const timer = setTimeout(() => {
        if (!cancel) setState({ kind: 'ready', data: demoData })
      }, 900)
      return () => { cancel = true; clearTimeout(timer) }
    }

    fetch(`/api/estados-financieros/audit-conceptos?rfc=${encodeURIComponent(rfc)}&year=${year}&month=${month}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (cancel) return
        if (!r.ok) {
          setState({ kind: 'error', mensaje: body?.error ?? 'No se pudo generar la auditoría.' })
          return
        }
        setState({ kind: 'ready', data: body as AuditData })
      })
      .catch(() => {
        if (!cancel) setState({ kind: 'error', mensaje: 'Error de red al consultar la auditoría.' })
      })
    return () => { cancel = true }
  }, [rfc, year, month, demoData])

  // Esc cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const periodoLabel = `${MESES[month - 1]} ${year}`
  const nombre = rfcAlias ?? rfcDisplay(rfc)

  const items = state.kind === 'ready' ? state.data.items : []
  const visibleItems = filter === 'all'
    ? items
    : items.filter((it) => it.veredicto === 'sospechoso' || it.veredicto === 'incorrecto')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Auditoría de conceptos · {nombre}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Compara la descripción del emisor contra la descripción oficial SAT · {periodoLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner className="h-8 w-8" />
              <p className="text-sm text-slate-500 dark:text-zinc-400">Cargando auditoría con Chikenelo…</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">Puede tardar 10-30 segundos.</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">No se pudo generar la auditoría</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{state.mensaje}</p>
            </div>
          )}

          {state.kind === 'ready' && state.data.items.length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-zinc-400">No hay conceptos para auditar en este periodo.</p>
            </div>
          )}

          {state.kind === 'ready' && state.data.items.length > 0 && (
            <>
              {/* Giro detectado de la cédula */}
              {state.data.giro && state.data.giro.length > 0 && (
                <div className="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-300">Giro detectado (cédula fiscal)</p>
                  <p className="text-xs text-indigo-800 dark:text-indigo-200 mt-0.5 leading-snug">
                    {state.data.giro.join(' · ')}
                  </p>
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                    La IA usa este giro para evaluar si un concepto sospechoso es razonable para tu negocio.
                  </p>
                </div>
              )}

              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {(['ok','sospechoso','incorrecto','sin_catalogo'] as Veredicto[]).map((v) => {
                  const s = VEREDICTO_STYLE[v]
                  return (
                    <div key={v} className={`rounded-xl px-3 py-2.5 ring-1 ${s.bg} ${s.ring}`}>
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${s.text}`}>{s.label}</p>
                      <p className={`text-xl font-black ${s.text}`}>{state.data.resumen[v]}</p>
                    </div>
                  )
                })}
              </div>

              {/* Disclaimer + acciones */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5">
                  <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Resultados generados por IA — pueden variar entre corridas. Descarga el CSV como respaldo.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-zinc-700 p-0.5 text-xs">
                    <button
                      onClick={() => setFilter('alertas')}
                      className={`px-3 py-1 rounded-md font-semibold ${filter === 'alertas' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-zinc-400'}`}
                    >
                      Solo alertas
                    </button>
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-3 py-1 rounded-md font-semibold ${filter === 'all' ? 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200' : 'text-slate-500 dark:text-zinc-400'}`}
                    >
                      Todos
                    </button>
                  </div>
                  <button
                    onClick={() => downloadCsv(state.data, rfcAlias)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
                    Descargar CSV
                  </button>
                </div>
              </div>

              {/* Tabla */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-zinc-800/60">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400">Tipo</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400">Clave</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400">Descripción SAT</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400">Descripción Emisor</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400 text-right">Importe</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-zinc-400">Veredicto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {visibleItems.map((it) => {
                      const s = VEREDICTO_STYLE[it.veredicto]
                      const rowKey = `${it.tipo}|${it.clave}|${it.emisorDesc}`
                      const cfdis = it.cfdis ?? []
                      const isOpen = expanded.has(rowKey)
                      return (
                        <Fragment key={rowKey}>
                          <tr className={it.veredicto === 'incorrecto' ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}>
                            <td className="px-3 py-2 capitalize text-slate-600 dark:text-zinc-300">{it.tipo}</td>
                            <td className="px-3 py-2 font-mono text-slate-700 dark:text-zinc-200">{it.clave}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-zinc-200 max-w-xs">
                              <span className="line-clamp-2">{it.satDesc || <em className="text-slate-400">— no en catálogo —</em>}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-zinc-200 max-w-xs">
                              <span className="line-clamp-2">{it.emisorDesc}</span>
                              {/* Un solo CFDI: se muestra directo (no hace falta desplegar). */}
                              {cfdis.length === 1 && (
                                <div className="mt-1.5 rounded-md bg-slate-50 dark:bg-zinc-800/60 px-2 py-1 text-[10px] text-slate-500 dark:text-zinc-400">
                                  <div className="flex items-center gap-1">
                                    <svg className="h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    <span className="font-mono break-all text-slate-600 dark:text-zinc-300">{cfdis[0].uuid}</span>
                                    <button
                                      onClick={() => navigator.clipboard?.writeText(cfdis[0].uuid)}
                                      title="Copiar UUID"
                                      className="shrink-0 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    >
                                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                  </div>
                                  <div className="mt-0.5">
                                    {[cfdis[0].serie, cfdis[0].folio].filter(Boolean).join('-') || 'S/F'}
                                    {cfdis[0].fecha ? ` · ${cfdis[0].fecha}` : ''}
                                    {cfdis[0].contraparte ? ` · ${cfdis[0].contraparte}` : ''}
                                  </div>
                                </div>
                              )}
                              {/* Varios CFDIs: se dejan agrupados con toggle. */}
                              {cfdis.length > 1 && (
                                <button
                                  onClick={() => toggleRow(rowKey)}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                  {isOpen ? 'Ocultar' : 'Ver'} {cfdis.length} comprobantes
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{MXN(it.importe)}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${s.bg} ${s.text}`}>
                                  {s.label}
                                </span>
                                {it.razon && (
                                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 leading-snug">{it.razon}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && cfdis.length > 1 && (
                            <tr className="bg-slate-50/70 dark:bg-zinc-800/40">
                              <td colSpan={6} className="px-3 pb-3 pt-1">
                                <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                                  <table className="w-full text-[11px]">
                                    <thead className="bg-slate-100/70 dark:bg-zinc-800/70 text-slate-500 dark:text-zinc-400">
                                      <tr className="text-left">
                                        <th className="px-2.5 py-1.5 font-semibold">Folio fiscal (UUID)</th>
                                        <th className="px-2.5 py-1.5 font-semibold">Serie-Folio</th>
                                        <th className="px-2.5 py-1.5 font-semibold">Fecha</th>
                                        <th className="px-2.5 py-1.5 font-semibold">{it.tipo === 'ingreso' ? 'Cliente' : 'Proveedor'}</th>
                                        <th className="px-2.5 py-1.5 font-semibold text-right">Importe</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                      {cfdis.map((c) => (
                                        <tr key={c.uuid}>
                                          <td className="px-2.5 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-mono text-slate-600 dark:text-zinc-300">{c.uuid}</span>
                                              <button
                                                onClick={() => navigator.clipboard?.writeText(c.uuid)}
                                                title="Copiar UUID"
                                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                              >
                                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                              </button>
                                            </div>
                                          </td>
                                          <td className="px-2.5 py-1.5 text-slate-600 dark:text-zinc-300">{[c.serie, c.folio].filter(Boolean).join('-') || '—'}</td>
                                          <td className="px-2.5 py-1.5 text-slate-600 dark:text-zinc-300 tabular-nums">{c.fecha || '—'}</td>
                                          <td className="px-2.5 py-1.5 text-slate-600 dark:text-zinc-300 max-w-[14rem] truncate" title={c.contraparte}>{c.contraparte || '—'}</td>
                                          <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-slate-700 dark:text-zinc-200">{MXN(c.importe)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {it.numConceptos > 25 && (
                                  <p className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500">
                                    Este grupo tiene {it.numConceptos} partidas; se muestran los comprobantes de las 25 de mayor importe.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-400 dark:text-zinc-500">
                          No hay registros con el filtro seleccionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
