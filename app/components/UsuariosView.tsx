'use client'

import { useEffect, useState } from 'react'
import FreemiumOverlay from './FreemiumOverlay'
import { useMembership } from './MembershipProvider'

interface Member {
  id: string
  name: string
  email: string
  created_at: string
}

interface RfcOption {
  id: string
  rfc: string
  alias: string | null
  assigned: boolean
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export default function UsuariosView() {
  const { isFree } = useMembership()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [adding,   setAdding]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [result,   setResult]   = useState<{ ok: boolean; text: string } | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId,  setConfirmId]  = useState<string | null>(null)

  // RFC assignment modal state
  const [rfcMember,       setRfcMember]       = useState<Member | null>(null)
  const [rfcOptions,      setRfcOptions]      = useState<RfcOption[]>([])
  const [rfcSelected,     setRfcSelected]     = useState<Set<string>>(new Set())
  const [rfcModalLoading, setRfcModalLoading] = useState(false)
  const [rfcSaving,       setRfcSaving]       = useState(false)
  const [rfcModalResult,  setRfcModalResult]  = useState<{ ok: boolean; text: string } | null>(null)

  async function loadMembers() {
    setLoading(true)
    try {
      const res = await fetch('/api/team')
      const data = await res.json()
      setMembers(data.members ?? [])
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMembers() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setAdding(true)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? 'Error al crear usuario' })
      } else {
        setResult({ ok: true, text: `Usuario "${name}" creado correctamente.` })
        setName(''); setEmail(''); setPassword('')
        setShowForm(false)
        loadMembers()
      }
    } catch {
      setResult({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setAdding(false)
    }
  }

  async function openRfcModal(m: Member) {
    setRfcMember(m)
    setRfcModalResult(null)
    setRfcModalLoading(true)
    try {
      const res = await fetch(`/api/team/${m.id}/rfcs`)
      const data = await res.json()
      const opts: RfcOption[] = data.rfcs ?? []
      setRfcOptions(opts)
      setRfcSelected(new Set(opts.filter((r) => r.assigned).map((r) => r.id)))
    } catch {
      setRfcOptions([])
      setRfcSelected(new Set())
    } finally {
      setRfcModalLoading(false)
    }
  }

  function toggleRfc(id: string) {
    setRfcSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSaveRfcs() {
    if (!rfcMember) return
    setRfcSaving(true)
    setRfcModalResult(null)
    try {
      const res = await fetch(`/api/team/${rfcMember.id}/rfcs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfcIds: Array.from(rfcSelected) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRfcModalResult({ ok: false, text: data.error ?? 'Error al guardar' })
      } else {
        setRfcModalResult({ ok: true, text: 'RFCs asignados correctamente.' })
      }
    } catch {
      setRfcModalResult({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setRfcSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirmId !== id) { setConfirmId(id); return }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/team/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? 'Error al eliminar' })
      } else {
        setMembers((prev) => prev.filter((m) => m.id !== id))
      }
    } catch {
      setResult({ ok: false, text: 'Error de red.' })
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  return (
    <FreemiumOverlay
      active={isFree}
      title="Agregar usuarios requiere un plan de pago"
      description="Tu plan gratis no permite invitar miembros a tu equipo. Suscribete a un plan empresarial para crear cuentas adicionales."
      variant="block"
    >
    <div className="flex-1 flex flex-col">
      <div className="lg:hidden h-14" />

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Usuarios</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Gestiona los miembros de tu cuenta. Maximo 10 usuarios.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setResult(null) }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar usuario
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Global result banner */}
          {result && (
            <div className={[
              'rounded-xl px-4 py-3 text-sm font-medium',
              result.ok
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
            ].join(' ')}>
              {result.text}
            </div>
          )}

          {/* Add member form */}
          {showForm && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Nuevo usuario</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  El usuario podra iniciar sesion con estas credenciales y tendra acceso de solo lectura a tu cuenta.
                </p>
              </div>
              <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Nombre completo</label>
                    <input
                      type="text" value={name} onChange={(e) => setName(e.target.value)}
                      required maxLength={120} placeholder="Ana García"
                      className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Correo electronico</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      required placeholder="ana@empresa.com"
                      className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Contrasena temporal</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      required minLength={8} placeholder="Min. 8 caracteres"
                      className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition"
                      aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                      {showPassword
                        ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit" disabled={adding}
                    className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
                  >
                    {adding ? 'Creando...' : 'Crear usuario'}
                  </button>
                  <button
                    type="button" onClick={() => { setShowForm(false); setResult(null) }}
                    className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-sm font-semibold px-5 py-2.5 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Members list */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">
                Miembros del equipo
                <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {members.length}
                </span>
              </h2>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400 dark:text-zinc-500">Cargando...</div>
            ) : members.length === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                  <svg className="h-6 w-6 text-slate-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Sin usuarios aun</p>
                <p className="text-xs text-slate-400 dark:text-zinc-500">Agrega tu primer usuario con el boton de arriba.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-4 px-6 py-4">
                    {/* Avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black">
                      {getInitials(m.name)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">{m.email}</p>
                    </div>
                    {/* Date */}
                    <div className="hidden sm:block text-xs text-slate-400 dark:text-zinc-500 shrink-0">
                      {formatDate(m.created_at)}
                    </div>
                    {/* Badge solo lectura */}
                    <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-slate-400 dark:text-zinc-500">
                      Solo lectura
                    </span>
                    {/* Assign RFCs */}
                    <button
                      onClick={() => openRfcModal(m)}
                      className="shrink-0 rounded-lg border border-[#7B6FE8]/40 dark:border-[#91eb78]/30 px-3 py-1.5 text-xs font-semibold text-[#7B6FE8] dark:text-[#91eb78] hover:bg-[#ebe9fb] dark:hover:bg-[#5E6957] transition-colors"
                    >
                      Asignar RFCs
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className={[
                        'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        confirmId === m.id
                          ? 'bg-red-500 hover:bg-red-600 text-white'
                          : 'border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400',
                      ].join(' ')}
                    >
                      {deletingId === m.id ? '...' : confirmId === m.id ? '¿Confirmar?' : 'Eliminar'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Info card */}
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 px-5 py-4">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                Los usuarios del equipo tienen acceso de <strong>solo lectura</strong> a todos los datos de tu cuenta.
                Pueden iniciar sesion con su correo y contrasena pero no pueden realizar cambios ni eliminar informacion.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── RFC assignment modal ── */}
      {rfcMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRfcMember(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <div>
                <h2 className="text-sm font-bold text-[#7B6FE8] dark:text-[#91eb78]">Asignar RFCs</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate max-w-[260px]">{rfcMember.name}</p>
              </div>
              <button
                onClick={() => setRfcMember(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                aria-label="Cerrar"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 max-h-64 overflow-y-auto">
              {rfcModalLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-4 w-32 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
                </div>
              ) : rfcOptions.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 text-center py-6">No hay RFCs registrados en tu cuenta.</p>
              ) : (
                <ul className="space-y-2">
                  {rfcOptions.map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                        <input
                          type="checkbox"
                          checked={rfcSelected.has(r.id)}
                          onChange={() => toggleRfc(r.id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-zinc-600 accent-[#7B6FE8] dark:accent-[#91eb78] cursor-pointer"
                        />
                        <span className="text-sm font-mono font-semibold text-slate-700 dark:text-zinc-200">{r.alias ?? r.rfc}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Result banner */}
            {rfcModalResult && (
              <div className={[
                'mx-6 mb-0 rounded-xl px-4 py-2.5 text-xs font-medium',
                rfcModalResult.ok
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              ].join(' ')}>
                {rfcModalResult.text}
              </div>
            )}

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-zinc-800">
              <button
                onClick={() => setRfcMember(null)}
                className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-sm font-semibold px-5 py-2 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleSaveRfcs}
                disabled={rfcSaving || rfcModalLoading}
                className="rounded-xl bg-[#7B6FE8] hover:bg-[#6a5fd6] dark:bg-[#91eb78] dark:hover:bg-[#7bbf5f] disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-black text-sm font-semibold px-5 py-2 transition-colors"
              >
                {rfcSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </FreemiumOverlay>
  )
}
