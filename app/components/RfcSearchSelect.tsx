'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface RfcSearchOption {
  rfc: string
  alias: string | null
}

interface Props {
  rfcs: RfcSearchOption[]
  value: string
  onChange: (rfc: string) => void
  focusRingClass?: string
  // Opcion extra que aparece al final del listado (p. ej. "Sube tus XMLs" en Facturas).
  extraOption?: { label: string; onSelect: () => void }
}

const POPOVER_WIDTH = 340

// Quita acentos y baja a minusculas para que la busqueda ignore diferencias de
// diacriticos (p. ej. "aurea" matchea "ÁUREA" y "cañon" matchea "canon").
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function RfcSearchSelect({
  rfcs,
  value,
  onChange,
  focusRingClass = 'focus:ring-blue-500',
  extraOption,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    function updatePos() {
      const rect = buttonRef.current!.getBoundingClientRect()
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16)
      let left = rect.right - width
      if (left < 8) left = 8
      setPos({ top: rect.bottom + 4, left })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const filtered = useMemo(() => {
    const sorted = [...rfcs].sort((a, b) =>
      (a.alias ?? a.rfc).localeCompare(b.alias ?? b.rfc, 'es', { sensitivity: 'base', numeric: true }),
    )
    const tokens = normalize(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return sorted
    return sorted.filter(r => {
      const haystack = `${normalize(r.alias ?? '')} ${normalize(r.rfc)}`
      return tokens.every(t => haystack.includes(t))
    })
  }, [rfcs, query])

  const popover =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 1000 }}
            className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl shadow-black/20"
          >
            <div className="border-b border-slate-100 dark:border-zinc-800 p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre o RFC..."
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-zinc-600"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500 dark:text-zinc-500">Sin resultados</div>
              ) : (
                filtered.map(r => (
                  <button
                    key={r.rfc}
                    type="button"
                    onClick={() => {
                      onChange(r.rfc)
                      setOpen(false)
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-zinc-800 ${
                      r.rfc === value ? 'bg-slate-50 dark:bg-zinc-800/60' : ''
                    }`}
                  >
                    {r.alias ? (
                      <>
                        <div className="font-semibold text-slate-800 dark:text-zinc-200 break-words leading-tight">{r.alias}</div>
                        <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-zinc-400">{r.rfc}</div>
                      </>
                    ) : (
                      <div className="font-semibold text-slate-800 dark:text-zinc-200 font-mono">{r.rfc}</div>
                    )}
                  </button>
                ))
              )}
              {extraOption && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-zinc-800" />
                  <button
                    type="button"
                    onClick={() => {
                      extraOption.onSelect()
                      setOpen(false)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    {extraOption.label}
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 ${focusRingClass}`}
      >
        <span>{value}</span>
        <svg
          className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {popover}
    </>
  )
}
