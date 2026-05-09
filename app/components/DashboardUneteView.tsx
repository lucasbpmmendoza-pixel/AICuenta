'use client'

import { useState } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

export default function DashboardUneteView({ session, accountType }: Props) {
  const [nombre, setNombre] = useState('')
  const [rfc, setRfc] = useState('')

  function handleAceptar() {
    const mensaje = encodeURIComponent(`Hola soy ${nombre.trim()} ${rfc.trim()}`)
    window.open(`https://wa.me/526563138465?text=${mensaje}`, '_blank')
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} />

      <main className="flex-1 flex flex-col lg:ml-0">
        <div className="lg:hidden h-14" />

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">IA Contable</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Unete a nuestro equipo</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex items-start justify-center">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col">

            <div className="bg-green-600 px-8 py-5">
              <h2 className="text-xl font-bold text-white tracking-tight">Unete a nuestro equipo</h2>
              <p className="text-sm text-green-100 mt-0.5">Un paso mas para empezar.</p>
            </div>

            <div className="flex flex-col gap-6 px-8 py-8">
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
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ingresa tu nombre completo"
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                />
              </div>

              {/* RFC */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  RFC
                </label>
                <input
                  type="text"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="Ej. XAXX010101000"
                  maxLength={50}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition text-sm font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleAceptar}
                disabled={nombre.trim() === '' || rfc.trim() === ''}
                className="rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors text-sm"
              >
                Aceptar - Ir a WhatsApp
              </button>
            </div>
          </div>
        </div>

        <DashboardFooter />
      </main>
    </div>
  )
}
