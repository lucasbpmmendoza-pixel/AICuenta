'use client'

import { useEffect, useState } from 'react'
import { rfcDisplay } from '@/lib/rfc-aliases'

export interface Categoria {
  nombre: string
  estandar_pct: number
  real_pct: number
  real_monto: number
  comentario: string
}

export interface BenchmarkData {
  ok: true
  industria: string
  resumen: string
  alertas: string[]
  recomendaciones: string[]
  categorias: Categoria[]
  meta: {
    rfc: string
    periodo: string
    razonSocial: string | null
    totales: {
      ingresosTotal: number
      egresosTotal: number
      nominaTotal: number
    }
  }
}

interface Props {
  rfc: string
  year: number
  month: number
  rfcAlias: string | null
  /** Si se provee, el modal omite la llamada al API y muestra estos datos (modo demo). */
  demoData?: BenchmarkData
  onClose: () => void
}

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v)

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; mensaje: string; needsCedula?: boolean }
  | { kind: 'ready'; data: BenchmarkData }

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-indigo-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

function DiffBadge({ real, estandar }: { real: number; estandar: number }) {
  const diff = real - estandar
  const abs = Math.abs(diff).toFixed(0)
  if (Math.abs(diff) < 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-zinc-300">
        En línea
      </span>
    )
  }
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
        +{abs} pp vs estándar
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
      −{abs} pp vs estándar
    </span>
  )
}

function ComparativaBarras({ categorias }: { categorias: Categoria[] }) {
  if (!categorias.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-slate-500 dark:text-zinc-400">
        Sin categorías para mostrar.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {categorias.map((cat) => (
        <div key={cat.nombre} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{cat.nombre}</h4>
            <DiffBadge real={cat.real_pct} estandar={cat.estandar_pct} />
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-slate-500 dark:text-zinc-400">Estándar de mercado</span>
                <span className="font-bold text-slate-700 dark:text-zinc-200">{cat.estandar_pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-400 dark:bg-zinc-500"
                  style={{ width: `${Math.min(100, cat.estandar_pct)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">Tu RFC</span>
                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                  {cat.real_pct.toFixed(0)}%
                  {cat.real_monto > 0 && (
                    <span className="ml-1 text-slate-400 dark:text-zinc-500 font-normal">· {MXN(cat.real_monto)}</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  style={{ width: `${Math.min(100, cat.real_pct)}%` }}
                />
              </div>
            </div>
          </div>

          {cat.comentario && (
            <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">{cat.comentario}</p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function EstadosFinancierosBenchmarkModal({ rfc, year, month, rfcAlias, demoData, onClose }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })

    // Modo demo: sin llamada al API. Breve "carga" simulada para que se sienta real.
    if (demoData) {
      const timer = setTimeout(() => {
        if (!cancelled) setState({ kind: 'ready', data: demoData })
      }, 900)
      return () => { cancelled = true; clearTimeout(timer) }
    }

    const url = `/api/estados-financieros/benchmark?rfc=${encodeURIComponent(rfc)}&year=${year}&month=${month}`
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          if (json?.error === 'no_cedula') {
            setState({ kind: 'error', mensaje: json.mensaje ?? 'Falta cédula fiscal.', needsCedula: true })
          } else {
            setState({ kind: 'error', mensaje: json?.error ?? 'No se pudo generar el comparativo.' })
          }
          return
        }
        setState({ kind: 'ready', data: json as BenchmarkData })
      })
      .catch(() => {
        if (cancelled) return
        setState({ kind: 'error', mensaje: 'Error de conexión. Intenta de nuevo.' })
      })
    return () => { cancelled = true }
  }, [rfc, year, month, demoData])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Comparativo de gastos vs mercado</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              {rfcAlias ?? rfcDisplay(rfc)} · {MESES[month - 1]} {year} · análisis con IA
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner className="h-8 w-8" />
              <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Cargando auditoría con Chikenelo…</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs text-center">
                Cruzando cédula fiscal, nómina y egresos del periodo contra el estándar de tu industria.
              </p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                {state.needsCedula ? 'Falta tu cédula fiscal' : 'No se pudo generar el análisis'}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md">{state.mensaje}</p>
              {state.needsCedula && (
                <a
                  href="/dashboard/documentos"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition"
                >
                  Cargar cédula fiscal
                </a>
              )}
            </div>
          )}

          {state.kind === 'ready' && (
            <div className="space-y-5">
              {/* Industria + resumen */}
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Industria detectada</p>
                <p className="text-base font-bold text-indigo-900 dark:text-indigo-200 mt-0.5">{state.data.industria}</p>
                {state.data.resumen && (
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-2 leading-relaxed">{state.data.resumen}</p>
                )}
              </div>

              {/* Totales */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-zinc-900 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Ingresos</p>
                  <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {MXN(state.data.meta.totales.ingresosTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-zinc-900 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Egresos</p>
                  <p className="text-sm font-black text-rose-700 dark:text-rose-300 mt-0.5">
                    {MXN(state.data.meta.totales.egresosTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-zinc-900 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Nómina</p>
                  <p className="text-sm font-black text-amber-700 dark:text-amber-300 mt-0.5">
                    {MXN(state.data.meta.totales.nominaTotal)}
                  </p>
                </div>
              </div>

              {/* Categorías */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
                  Distribución de gastos
                </h3>
                <ComparativaBarras categorias={state.data.categorias} />
              </div>

              {/* Alertas */}
              {state.data.alertas.length > 0 && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1.5">Alertas</p>
                  <ul className="space-y-1">
                    {state.data.alertas.map((a, i) => (
                      <li key={i} className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recomendaciones */}
              {state.data.recomendaciones.length > 0 && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">Recomendaciones</p>
                  <ul className="space-y-1">
                    {state.data.recomendaciones.map((r, i) => (
                      <li key={i} className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
                Los porcentajes estándar son una estimación de IA con base en la actividad económica de la cédula fiscal. Úsalos como referencia, no como cifra oficial.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-zinc-800 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
