'use client'

import { useEffect, useState } from 'react'
import DropZone from './DropZone'
import { uploadRfc } from '@/app/api/actions/uploadRfc'

interface Rfc {
  id: string
  rfc: string
  fiel: string
  downloads_enabled: boolean
  created_at: string
  last_update: string
}

interface Props {
  readOnly?: boolean
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Inline RFC form ────────────────────────────────────────────
function RfcForm({
  initial,
  onSuccess,
  onCancel,
}: {
  initial?: Rfc
  onSuccess: (msg: string) => void
  onCancel: () => void
}) {
  const [rfc,     setRfc]     = useState(initial?.rfc ?? '')
  const [efiel,   setEfiel]   = useState('')
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [showEfiel, setShowEfiel] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fd = new FormData()
    fd.append('rfc',   rfc)
    fd.append('efiel', efiel)
    if (cerFile) fd.append('cer', cerFile)
    if (keyFile) fd.append('key', keyFile)

    const result = await uploadRfc(fd)
    setLoading(false)

    if (!result.success) {
      setError(result.message)
    } else {
      onSuccess(result.message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
      {/* RFC */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">RFC</label>
        <input
          type="text" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())}
          disabled={!!initial} required maxLength={13} placeholder="Ej. XAXX010101000"
          className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-60"
        />
      </div>

      {/* EFIEL password */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
          Contrasena e.firma
        </label>
        <div className="relative">
          <input
            type={showEfiel ? 'text' : 'password'} value={efiel} onChange={(e) => setEfiel(e.target.value)}
            required maxLength={500} placeholder="Contrasena de tu e.firma"
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <button type="button" onClick={() => setShowEfiel((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition"
            aria-label={showEfiel ? 'Ocultar' : 'Mostrar'}>
            {showEfiel
              ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
        {initial && (
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
            Ingresa la nueva contrasena. La actual no se muestra por seguridad.
          </p>
        )}
      </div>

      {/* File uploads */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DropZone label="Archivo .CER" accept=".cer" extension="cer" file={cerFile} onFile={setCerFile} />
        <DropZone label="Archivo .KEY" accept=".key" extension="key" file={keyFile} onFile={setKeyFile} />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading}
          className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors">
          {loading ? 'Guardando...' : initial ? 'Actualizar RFC' : 'Registrar RFC'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-sm font-semibold px-5 py-2.5 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Main view ──────────────────────────────────────────────────
export default function RFCsView({ readOnly = false }: Props) {
  const [rfcs,    setRfcs]    = useState<Rfc[]>([])
  const [loading, setLoading] = useState(true)
  const [banner,  setBanner]  = useState<{ ok: boolean; text: string } | null>(null)

  // Form state
  const [showAdd,    setShowAdd]    = useState(false)
  const [editingRfc, setEditingRfc] = useState<Rfc | null>(null)

  // Action states
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [togglingId,      setTogglingId]      = useState<string | null>(null)
  const [search,          setSearch]          = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/rfcs')
      const data = await res.json()
      setRfcs(data.rfcs ?? [])
    } catch { setRfcs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function flash(ok: boolean, text: string) {
    setBanner({ ok, text })
    setTimeout(() => setBanner(null), 4000)
  }

  async function handleToggle(rfc: Rfc) {
    setTogglingId(rfc.id)
    try {
      const res = await fetch(`/api/rfcs/${rfc.id}`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        setRfcs((prev) => prev.map((r) => r.id === rfc.id ? { ...r, downloads_enabled: data.downloads_enabled } : r))
      } else {
        flash(false, data.error ?? 'Error al actualizar')
      }
    } catch { flash(false, 'Error de red.') }
    finally { setTogglingId(null) }
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/rfcs/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setRfcs((prev) => prev.filter((r) => r.id !== id))
        flash(true, 'RFC eliminado.')
      } else {
        flash(false, data.error ?? 'Error al eliminar')
      }
    } catch { flash(false, 'Error de red.') }
    finally { setDeletingId(null); setConfirmDeleteId(null) }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="lg:hidden h-14" />

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">RFCs</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              {readOnly ? 'Visualiza los RFCs registrados en esta cuenta.' : 'Gestiona los RFCs y sus e.firmas.'}
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={() => { setShowAdd(!showAdd); setEditingRfc(null); setBanner(null) }}
              className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar RFC
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Banner */}
          {banner && (
            <div className={[
              'rounded-xl px-4 py-3 text-sm font-medium',
              banner.ok
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
            ].join(' ')}>
              {banner.text}
            </div>
          )}

          {/* Add form */}
          {showAdd && !readOnly && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Nuevo RFC</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  Sube los archivos .CER y .KEY de la e.firma para este RFC.
                </p>
              </div>
              <RfcForm
                onSuccess={(msg) => { flash(true, msg); setShowAdd(false); load() }}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {/* Edit form */}
          {editingRfc && !readOnly && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-blue-100 dark:border-blue-900/40">
                <h2 className="text-sm font-bold text-blue-700 dark:text-blue-light-300">Actualizar RFC: {editingRfc.rfc}</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  Sube los nuevos archivos .CER y .KEY para renovar la e.firma.
                </p>
              </div>
              <RfcForm
                initial={editingRfc}
                onSuccess={(msg) => { flash(true, msg); setEditingRfc(null); load() }}
                onCancel={() => setEditingRfc(null)}
              />
            </div>
          )}

          {/* RFC list */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78] shrink-0">
                RFCs registrados
                <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {rfcs.length}
                </span>
              </h2>
              {rfcs.length > 0 && (
                <div className="relative flex-1">
                  <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar RFC..."
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 pl-8 pr-4 py-1.5 text-sm text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-light-light-500 transition"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400 dark:text-zinc-500">Cargando...</div>
            ) : rfcs.length === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                  <svg className="h-6 w-6 text-slate-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Sin RFCs registrados</p>
                {!readOnly && <p className="text-xs text-slate-400 dark:text-zinc-500">Agrega tu primer RFC con el boton de arriba.</p>}
              </div>
            ) : (() => {
                const filtered = rfcs.filter((r) => r.rfc.toLowerCase().includes(search.toLowerCase()))
                return filtered.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-slate-400 dark:text-zinc-500">
                    Sin resultados para <span className="font-semibold">&ldquo;{search}&rdquo;</span>
                  </div>
                ) : (
              <ul className="max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800">
                {filtered.map((r) => (
                  <li key={r.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-800">
                        <svg className="h-5 w-5 text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800 dark:text-zinc-100 tracking-wide">{r.rfc}</span>
                          {/* Downloads badge */}
                          <span className={[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                            r.downloads_enabled
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500',
                          ].join(' ')}>
                            {r.downloads_enabled ? 'Descargas activas' : 'Descargas pausadas'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                          Actualizado: {formatDate(r.last_update)} · Registrado: {formatDate(r.created_at)}
                        </p>
                      </div>

                      {/* Actions */}
                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {/* Edit */}
                          <button
                            onClick={() => { setEditingRfc(editingRfc?.id === r.id ? null : r); setShowAdd(false) }}
                            className={[
                              'rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors',
                              editingRfc?.id === r.id
                                ? 'border-blue-light-ldeep-lblue-ldeep-ldeep-ldeep-ldeep-ldeep-ldeep-ldeep-ldeep-lblue-ldeep-ldeep-ldeep-lblue-ldeep-ldeep-lblue-light-light-light-light-light-lblue-ldeep-ldeep-ldeep-ldeep-ldeep-ldeep-ldeep-lblue-ldeep-ldeep-ldeep-lblue-light-light-light-light-light-light-light-light-light-light-light-light-light-light-400 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                                : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:border-blue-300 hover:text-blue-600',
                            ].join(' ')}
                          >
                            {editingRfc?.id === r.id ? 'Cancelar edicion' : 'Editar'}
                          </button>

                          {/* Toggle downloads */}
                          <button
                            onClick={() => handleToggle(r)}
                            disabled={togglingId === r.id}
                            className={[
                              'rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-50',
                              r.downloads_enabled
                                ? 'border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                : 'border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
                            ].join(' ')}
                          >
                            {togglingId === r.id ? '...' : r.downloads_enabled ? 'Pausar' : 'Activar'}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className={[
                              'rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-50',
                              confirmDeleteId === r.id
                                ? 'bg-red-500 hover:bg-red-600 border-red-500 text-white'
                                : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400',
                            ].join(' ')}
                          >
                            {deletingId === r.id ? '...' : confirmDeleteId === r.id ? '¿Confirmar?' : 'Eliminar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          })()}
          </div>

        </div>
      </div>
    </div>
  )
}
