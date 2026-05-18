'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JWTPayload } from '@/lib/auth'
import { registerOwnRfc } from '@/app/api/actions/registerOwnRfc'
import DropZone from './DropZone'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
  rfcFromDb: string | null
  efieles: string[]
}

export default function ConfiguracionView({ session, accountType, rfcFromDb, efieles }: Props) {
  const router = useRouter()

  // Edit form state
  const [name, setName] = useState(session.name)
  const [email, setEmail] = useState(session.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password visibility
  const [showNewPassword,     setShowNewPassword]     = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // RFC management state (multi only)
  const [selectedRfc, setSelectedRfc] = useState(efieles[0] ?? '')
  const [settingRfc, setSettingRfc] = useState(false)
  const [setRfcMsg, setSetRfcMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showRegisterFiel, setShowRegisterFiel] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerMsg, setRegisterMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showFielPassword, setShowFielPassword] = useState(false)
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)

  async function handleSetRfc() {
    if (!selectedRfc) return
    setSettingRfc(true)
    setSetRfcMsg(null)
    try {
      const res = await fetch('/api/auth/set-rfc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc: selectedRfc }),
      })
      const data = await res.json()
      if (res.ok) {
        setSetRfcMsg({ ok: true, text: `RFC ${selectedRfc} asignado correctamente.` })
        router.refresh()
      } else {
        setSetRfcMsg({ ok: false, text: data.error ?? 'Error al asignar RFC.' })
      }
    } catch {
      setSetRfcMsg({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setSettingRfc(false)
    }
  }

  async function handleRegisterRfc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cerFile || !keyFile) {
      setRegisterMsg({ ok: false, text: 'Debes subir los archivos .CER y .KEY.' })
      return
    }
    setRegistering(true)
    setRegisterMsg(null)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('cer', cerFile, cerFile.name)
      fd.set('key', keyFile, keyFile.name)
      const result = await registerOwnRfc(fd)
      setRegisterMsg({ ok: result.success, text: result.message })
      if (result.success) router.refresh()
    } catch {
      setRegisterMsg({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setRegistering(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveMsg(null)
    setSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveMsg({ ok: false, text: data.error ?? 'Error al guardar.' })
      } else {
        setSaveMsg({ ok: true, text: 'Datos actualizados correctamente.' })
        setCurrentPassword('')
        setNewPassword('')
      }
    } catch {
      setSaveMsg({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/auth/profile', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setDeleteError(data.error ?? 'Error al eliminar la cuenta.')
        setDeleting(false)
        return
      }
      router.push('/login')
    } catch {
      setDeleteError('Error de red. Intenta de nuevo.')
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top padding for mobile bar */}
      <div className="lg:hidden h-14" />

      {/* Page header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Configuracion</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Administra tu cuenta y datos personales.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-6">

          {/* ── Edit profile card ── */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Datos personales</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Ingresa tu contrasena actual para guardar cambios.
              </p>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Correo electronico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* RFC (solo lectura si está registrado) */}
              {rfcFromDb && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    RFC
                  </label>
                  <input
                    type="text"
                    value={rfcFromDb}
                    readOnly
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-700 px-4 py-2.5 text-sm font-mono text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">RFC vinculado a tu cuenta - no editable.</p>
                </div>
              )}

              {/* Nueva contraseña (opcional) */}              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Nueva contrasena <span className="normal-case font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Dejar en blanco para no cambiar"
                    maxLength={128}
                    className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <button type="button" onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition"
                    aria-label={showNewPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                    {showNewPassword
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>

              {/* Contrasena actual (requerida para confirmar) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Contrasena actual <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Requerida para confirmar cambios"
                    className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <button type="button" onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition"
                    aria-label={showCurrentPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}>
                    {showCurrentPassword
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>

              {saveMsg && (
                <div className={[
                  'rounded-lg px-4 py-3 text-sm font-medium',
                  saveMsg.ok
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                ].join(' ')}>
                  {saveMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>

          {/* ── RFC propio (solo cuentas multi sin RFC asignado, solo owners) ── */}
          {accountType === 'multi' && !rfcFromDb && !session.ownerId && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
                <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">Tu RFC y FIEL</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  Registra o selecciona el RFC que identifica a tu empresa.
                </p>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Selector de RFC existente en EFIELES */}
                {efieles.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                      Ya tienes tu RFC, seleccionalo
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={selectedRfc}
                        onChange={(e) => setSelectedRfc(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-slate-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {efieles.map((rfc) => (
                          <option key={rfc} value={rfc}>{rfc}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleSetRfc}
                        disabled={settingRfc || !selectedRfc}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 transition-colors"
                      >
                        {settingRfc ? 'Guardando...' : 'Aceptar'}
                      </button>
                    </div>
                    {setRfcMsg && (
                      <p className={['text-xs font-medium', setRfcMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'].join(' ')}>
                        {setRfcMsg.text}
                      </p>
                    )}
                    <div className="relative flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-700" />
                      <span>o</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-700" />
                    </div>
                  </div>
                )}

                {/* Boton para registrar propia FIEL */}
                <button
                  type="button"
                  onClick={() => setShowRegisterFiel((v) => !v)}
                  className="w-full rounded-xl border border-blue-300 dark:border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left flex items-center justify-between"
                >
                  <span>Registra tu propia FIEL y RFC</span>
                  <svg className={['h-4 w-4 transition-transform', showRegisterFiel ? 'rotate-180' : ''].join(' ')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Formulario inline de registro FIEL */}
                {showRegisterFiel && (
                  <form onSubmit={handleRegisterRfc} className="space-y-3 pt-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">RFC</label>
                      <input
                        name="rfc"
                        type="text"
                        required
                        maxLength={13}
                        placeholder="XAXX010101000"
                        className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Contrasena EFIEL</label>
                      <div className="relative">
                        <input
                          name="efiel"
                          type={showFielPassword ? 'text' : 'password'}
                          required
                          placeholder="Contrasena de tu FIEL"
                          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={() => setShowFielPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition">
                          {showFielPassword
                            ? <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <DropZone
                        label="Archivo .CER"
                        accept=".cer"
                        extension="cer"
                        file={cerFile}
                        onFile={setCerFile}
                      />
                      <DropZone
                        label="Archivo .KEY"
                        accept=".key"
                        extension="key"
                        file={keyFile}
                        onFile={setKeyFile}
                      />
                    </div>

                    {registerMsg && (
                      <p className={['rounded-lg px-4 py-3 text-xs font-medium', registerMsg.ok ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'].join(' ')}>
                        {registerMsg.text}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={registering}
                      className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
                    >
                      {registering ? 'Registrando...' : 'Guardar FIEL y RFC'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ── Danger zone ── */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/50 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/40">
              <h2 className="text-sm font-bold text-red-600 dark:text-red-400">Zona de peligro</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Estas acciones son irreversibles.
              </p>
            </div>

            <div className="px-6 py-5">
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Eliminar cuenta</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                      Se eliminaran permanentemente todos tus datos y archivos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="shrink-0 rounded-xl border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Eliminar cuenta
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    ¿Estas seguro? Esta accion no se puede deshacer.
                  </p>
                  {deleteError && (
                    <p className="text-xs text-red-500 dark:text-red-400">{deleteError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
                    >
                      {deleting ? 'Eliminando...' : 'Sí, eliminar mi cuenta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeleteError('') }}
                      className="flex-1 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-600 dark:text-zinc-300 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
