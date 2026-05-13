'use client'

import { useState } from 'react'

export default function SoporteView() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setSending(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? 'Error al enviar. Intenta de nuevo.' })
      } else {
        setResult({ ok: true, text: 'Tu mensaje fue enviado. Te responderemos pronto.' })
        setSubject('')
        setMessage('')
      }
    } catch {
      setResult({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top padding for mobile bar */}
      <div className="lg:hidden h-14" />

      {/* Page header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Soporte</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
          Envianos un mensaje y te responderemos a la brevedad.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Form card */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Nuevo mensaje</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Describe tu problema o pregunta con el mayor detalle posible.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Asunto
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={160}
                  placeholder="Ej. No puedo subir mis archivos .CER"
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Message */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Mensaje
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={6}
                  maxLength={4000}
                  placeholder="Describe tu situacion con detalle..."
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                />
                <p className="text-right text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  {message.length} / 4000
                </p>
              </div>

              {result && (
                <div className={[
                  'rounded-lg px-4 py-3 text-sm font-medium',
                  result.ok
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                ].join(' ')}>
                  {result.text}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
              >
                {sending ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </form>
          </div>

          {/* Info card */}
          <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-6 py-4">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                Nuestro equipo suele responder en menos de 24 horas en dias habiles.
                Recibirás la respuesta en el correo de tu cuenta.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
