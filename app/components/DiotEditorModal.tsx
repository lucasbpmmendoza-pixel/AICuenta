'use client'

import { useEffect, useMemo, useState } from 'react'
import { rfcDisplay } from '@/lib/rfc-aliases'
import { logAction } from '@/lib/logs'
import {
  type DiotCampoImporte,
  type DiotCuadroRow,
  buildDiotTxt,
  generaLinea,
  toDiotLineInput,
} from '@/lib/diot-format'

interface Props {
  rfc: string
  /** Nombre o alias del contribuyente, para el encabezado del cuadro. */
  nombre: string
  /** Etiqueta del periodo ya formateada (ej. "08-2026"). */
  periodLabel: string
  /** Query string del periodo, tal como lo arma FacturasView. */
  periodParams: string
  onClose: () => void
}

interface FilaEdit {
  id: string
  rfc: string
  valores: Record<DiotCampoImporte, string>
}

const CAMPOS: { key: DiotCampoImporte; label: string }[] = [
  { key: 'base8',      label: 'Base IVA 8' },
  { key: 'iva8',       label: 'IVA 8' },
  { key: 'base16',     label: 'Base IVA 16' },
  { key: 'iva16',      label: 'IVA 16' },
  { key: 'base0',      label: 'Base IVA 0' },
  { key: 'baseExento', label: 'Base IVA Exento' },
]

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/

const MXN = (v: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const num = (s: string): number => {
  const x = Number(String(s).replace(/,/g, '').trim())
  return Number.isFinite(x) ? x : 0
}

const dec = (v: number): string => (Math.round(v * 100) / 100).toFixed(2)

function aFilaEdit(row: DiotCuadroRow, i: number): FilaEdit {
  return {
    id: `${row.rfc}-${i}`,
    rfc: row.rfc,
    valores: {
      base8:      dec(row.base8),
      iva8:       dec(row.iva8),
      base16:     dec(row.base16),
      iva16:      dec(row.iva16),
      base0:      dec(row.base0),
      baseExento: dec(row.baseExento),
    },
  }
}

function aCuadroRow(f: FilaEdit): DiotCuadroRow {
  return {
    rfc: f.rfc.trim().toUpperCase(),
    base8:      num(f.valores.base8),
    iva8:       num(f.valores.iva8),
    base16:     num(f.valores.base16),
    iva16:      num(f.valores.iva16),
    base0:      num(f.valores.base0),
    baseExento: num(f.valores.baseExento),
  }
}

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-indigo-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

export default function DiotEditorModal({ rfc, nombre, periodLabel, periodParams, onClose }: Props) {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filas, setFilas]       = useState<FilaEdit[]>([])
  // Snapshot de lo que vino del servidor: sirve para pintar de amarillo lo editado.
  const [originales, setOriginales] = useState<Record<string, FilaEdit>>({})

  useEffect(() => {
    let cancelado = false
    fetch(`/api/export/diot?rfc=${encodeURIComponent(rfc)}&${periodParams}&format=json`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.text()) || 'Error al generar el cuadro DIOT')
        return res.json()
      })
      .then((d: { rows?: DiotCuadroRow[] }) => {
        if (cancelado) return
        const nuevas = (d.rows ?? []).map(aFilaEdit)
        setFilas(nuevas)
        setOriginales(Object.fromEntries(nuevas.map(f => [f.id, structuredClone(f)])))
      })
      .catch(err => { if (!cancelado) setError((err as Error).message) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [rfc, periodParams])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function editarImporte(id: string, campo: DiotCampoImporte, valor: string) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, valores: { ...f.valores, [campo]: valor } } : f)))
  }

  function editarRfc(id: string, valor: string) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, rfc: valor.toUpperCase() } : f)))
  }

  function restablecer() {
    const base = Object.values(originales)
    setFilas(base.map(f => structuredClone(f)))
  }

  const rfcEditado = (f: FilaEdit) => originales[f.id] ? originales[f.id].rfc !== f.rfc.trim().toUpperCase() : false
  const importeEditado = (f: FilaEdit, campo: DiotCampoImporte) =>
    originales[f.id] ? num(originales[f.id].valores[campo]) !== num(f.valores[campo]) : false

  const cuadro   = useMemo(() => filas.map(aCuadroRow), [filas])
  const lineas   = useMemo(() => cuadro.map(toDiotLineInput), [cuadro])
  const txt      = useMemo(() => buildDiotTxt(cuadro), [cuadro])
  const numLineas = lineas.filter(generaLinea).length

  const totales = useMemo(() => {
    const t: Record<DiotCampoImporte, number> = { base8: 0, iva8: 0, base16: 0, iva16: 0, base0: 0, baseExento: 0 }
    for (const r of cuadro) {
      t.base8 += r.base8; t.iva8 += r.iva8; t.base16 += r.base16
      t.iva16 += r.iva16; t.base0 += r.base0; t.baseExento += r.baseExento
    }
    return t
  }, [cuadro])

  const rfcsInvalidos = filas.filter(f => !RFC_RE.test(f.rfc.trim().toUpperCase())).length
  const hayCambios = filas.some(f => rfcEditado(f) || CAMPOS.some(c => importeEditado(f, c.key)))

  function descargarTxt() {
    if (rfcsInvalidos > 0 || numLineas === 0) return
    logAction('btn_descargar_diot_txt')
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `diot_${rfcDisplay(rfc)}_${periodLabel}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const celdaBase = 'w-full rounded-md border px-2 py-1 text-right text-xs tabular-nums outline-none transition focus:ring-2 focus:ring-indigo-500'
  const celdaNormal = 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200'
  const celdaAmarilla = 'border-yellow-400 dark:border-yellow-500/60 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-900 dark:text-yellow-200 font-semibold'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              DIOT · {nombre}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              Periodo {periodLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Spinner className="h-7 w-7" />
              <p className="text-sm text-slate-500 dark:text-zinc-400">Generando el cuadro DIOT…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                  {filas.length} proveedores
                </span>
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                  {numLineas} renglones en el TXT
                </span>
                {hayCambios && (
                  <span className="rounded-full bg-yellow-100 dark:bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300">
                    Cuadro modificado
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={restablecer}
                    disabled={!hayCambios}
                    className="rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300 transition hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-zinc-800"
                  >
                    Restablecer
                  </button>
                </div>
              </div>

              {/* Cuadro (mismo layout que el Excel del contador) */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-slate-50 dark:bg-zinc-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 dark:text-zinc-300">RFC Proveedor</th>
                      {CAMPOS.map(c => (
                        <th key={c.key} className="px-3 py-2 text-right font-bold text-slate-600 dark:text-zinc-300 whitespace-nowrap">{c.label}</th>
                      ))}
                      <th className="px-3 py-2 text-center font-bold text-slate-600 dark:text-zinc-300 whitespace-nowrap">Tercero</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filas.map((f, i) => {
                      const linea = lineas[i]
                      const rfcOk = RFC_RE.test(f.rfc.trim().toUpperCase())
                      const enTxt = generaLinea(linea)
                      return (
                        <tr key={f.id} className={enTxt ? '' : 'opacity-60'}>
                          <td className="px-3 py-1.5">
                            <input
                              value={f.rfc}
                              onChange={e => editarRfc(f.id, e.target.value)}
                              maxLength={13}
                              placeholder="RFC"
                              className={`w-40 rounded-md border px-2 py-1 text-left text-xs font-mono uppercase outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                                !rfcOk
                                  ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                  : rfcEditado(f) ? celdaAmarilla : celdaNormal
                              }`}
                            />
                          </td>
                          {CAMPOS.map(c => (
                            <td key={c.key} className="px-3 py-1.5">
                              <input
                                inputMode="decimal"
                                value={f.valores[c.key]}
                                onChange={e => editarImporte(f.id, c.key, e.target.value)}
                                onFocus={e => e.currentTarget.select()}
                                className={`${celdaBase} ${importeEditado(f, c.key) ? celdaAmarilla : celdaNormal}`}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-center font-mono text-slate-500 dark:text-zinc-400">{linea.tipoTercero}</td>
                        </tr>
                      )
                    })}
                    {filas.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-slate-400 dark:text-zinc-500">
                          Sin proveedores en el periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-zinc-800/60">
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-700 dark:text-zinc-200">TOTALES</td>
                      {CAMPOS.map(c => (
                        <td key={c.key} className="px-3 py-2 text-right font-bold tabular-nums text-slate-700 dark:text-zinc-200">
                          {MXN(totales[c.key])}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-zinc-800 px-6 py-4">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {rfcsInvalidos > 0
              ? <span className="font-semibold text-red-600 dark:text-red-400">{rfcsInvalidos} RFC con formato inválido — corrígelos para descargar.</span>
              : `Archivo: diot_${rfcDisplay(rfc)}_${periodLabel}.txt`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-300 transition hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={descargarTxt}
              disabled={loading || !!error || rfcsInvalidos > 0 || numLineas === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>
              Descargar TXT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
