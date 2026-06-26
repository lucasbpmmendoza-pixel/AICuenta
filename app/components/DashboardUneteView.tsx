'use client'

import { useState, useEffect } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import FreemiumOverlayScreen from './FreemiumOverlayScreen'
import { useAuth } from './AuthProvider'
import { rfcDisplay } from '@/lib/rfc-aliases'

const UNETE_HINT_KEY = 'aicuenta_unete_first_visit'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
  rfcFromDb: string
  ownerRfc: string | null
  allRfcs: string[]
  readOnly?: boolean
}

export default function DashboardUneteView({ session, accountType, rfcFromDb, ownerRfc, allRfcs, readOnly = false }: Props) {
  const { user } = useAuth()
  const isFreemium = !session.isDemo && Boolean(user?.isFreemium)
  const [nombre, setNombre] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showNamePulse, setShowNamePulse] = useState(false)
  // Checkboxes: por defecto todos seleccionados
  const [checkedRfcs, setCheckedRfcs] = useState<Set<string>>(new Set(allRfcs))
  // RFC principal para el mensaje de WhatsApp (el primero seleccionado)
  const selectedRfc = allRfcs.find(r => checkedRfcs.has(r)) ?? ''

  // First-visit name input pulse
  useEffect(() => {
    if (typeof window === 'undefined') return
    const visited = localStorage.getItem(UNETE_HINT_KEY)
    if (!visited) {
      setShowNamePulse(true)
      localStorage.setItem(UNETE_HINT_KEY, 'true')
    }
  }, [])

  // Auto-hide pulse after 30s
  useEffect(() => {
    if (!showNamePulse) return
    const timer = setTimeout(() => setShowNamePulse(false), 30000)
    return () => clearTimeout(timer)
  }, [showNamePulse])

  function dismissNamePulse() {
    setShowNamePulse(false)
  }

  function toggleRfc(rfc: string) {
    if (readOnly) return
    setCheckedRfcs(prev => {
      const next = new Set(prev)
      if (next.has(rfc)) next.delete(rfc)
      else next.add(rfc)
      return next
    })
  }

  async function handleAceptar() {
    if (readOnly) return
    setSending(true)
    setError('')
    try {
      const rfcsToSend = allRfcs.filter(r => checkedRfcs.has(r))
      const res = await fetch('/api/unete/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, selectedRfc, rfcs: rfcsToSend }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al registrar'); return }
      const mensaje = encodeURIComponent(`${nombre.trim()} RFC:${rfcDisplay(selectedRfc)} UserCode:${data.userCode} Code:${data.code}`)
      window.open(`https://wa.me/526563138465?text=${mensaje}`, '_blank')
    } catch {
      setError('Error de red, intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  if (isFreemium) {
    return (
      <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
        <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
        <FreemiumOverlayScreen featureName="AIChikenelo" description="Unete a nuestro equipo de afiliados. Disponible en planes de pago." />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />

    <main className="flex-1 flex flex-col lg:ml-60">
          <div className="lg:hidden h-14" />

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <h1 className="text-lg font-bold text-[#7B6FE8] dark:text-[#91eb78]">AIChikenelo</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Unete a nuestro equipo</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex items-start justify-center">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col">

            <div className="bg-gradient-to-b from-brand-green to-brand-lime px-8 py-5">
              <h2 className="text-xl font-bold text-zinc-700 dark:text-white tracking-tight">Unete a nuestro equipo</h2>
              <p className="text-sm text-zinc-700 dark:text-white mt-0.5">Un paso mas para empezar.</p>
            </div>

            <div className="flex flex-col gap-6 px-8 py-8">
              {readOnly && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  Vista demo: puedes ver la interfaz pero no interactuar.
                </p>
              )}

              <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
                Para ser una empresa de vanguardia usamos IA. Si quieres unirte a nuestro equipo,
                escribenos por WhatsApp con el boton de abajo y nos ponemos en contacto contigo.
              </p>

              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value)
                    dismissNamePulse()
                  }}
                  disabled={readOnly}
                  placeholder="Ingresa tu nombre completo"
                  className={`rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition text-sm ${showNamePulse ? 'animate-wave-input-emerald' : ''}`}
                />
              </div>

              {/* RFCs del usuario — seleccion con checkboxes */}
              {allRfcs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    RFC(s) a registrar
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {allRfcs.map(rfc => (
                      <label
                        key={rfc}
                        className="flex items-center gap-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 cursor-pointer hover:border-green-500 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checkedRfcs.has(rfc)}
                          onChange={() => toggleRfc(rfc)}
                          disabled={readOnly}
                          className="w-4 h-4 accent-green-500 cursor-pointer shrink-0"
                        />
                        <span className="font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          {rfcDisplay(rfc)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-3 text-xs font-semibold text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleAceptar}
                disabled={readOnly || sending || nombre.trim() === '' || checkedRfcs.size === 0}
                className="rounded-xl bg-brand-green hover:bg-[#25D366] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors text-sm"
              >
                {sending ? 'Registrando...' : 'Aceptar - Ir a WhatsApp'}
              </button>
            </div>
          </div>
        </div>

        <DashboardFooter />
      </main>
    </div>
  )
}
