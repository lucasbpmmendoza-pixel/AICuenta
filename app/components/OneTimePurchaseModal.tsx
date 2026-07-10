'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  // Copy para el modal.
  title: string
  description: string
  priceLabel: string        // p. ej. "$50 MXN" o "$100 MXN"
  ctaLabel?: string         // default: "Pagar y continuar"
  // Cuerpo a mandar al endpoint /api/billing/checkout-one-time
  tipo: 'cuadro_download' | 'comparar_auditar_mes'
}

/**
 * Modal generico para los pagos one-time (Stripe Checkout mode=payment).
 * Al confirmar redirige a la Checkout Session; el webhook marca la compra
 * como 'pagada' y el consumo lo hace la vista al regresar (o al reintentar).
 */
export default function OneTimePurchaseModal({
  open,
  onClose,
  title,
  description,
  priceLabel,
  ctaLabel = 'Pagar y continuar',
  tipo,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handlePay() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout-one-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setError(data.error || 'No se pudo iniciar el pago')
        setLoading(false)
        return
      }
      window.location.assign(data.url)
    } catch {
      setError('Error de red al iniciar el pago')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Cerrar"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]">
          <svg className="h-7 w-7 text-[#7B6FE8] dark:text-[#91EB78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-zinc-400">{description}</p>

        <div className="mt-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">Pago único</div>
          <div className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">{priceLabel}</div>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            )}
            {loading ? 'Redirigiendo…' : ctaLabel}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
