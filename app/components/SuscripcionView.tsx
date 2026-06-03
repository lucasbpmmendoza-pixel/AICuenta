'use client'

import { useEffect, useMemo, useState } from 'react'

type Plan = {
  id: number
  nombre: string
  costo: number
  duracion_meses: number
  stripe_price_id: string
  descripcion: string | null
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: 1,
    nombre: 'Gratis',
    costo: 0,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_free',
    descripcion: 'Empieza con lo basico y prueba el panel.',
  },
  {
    id: 2,
    nombre: 'Profesional',
    costo: 10,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_10',
    descripcion: 'Ideal para llevar el control mensual de tu operacion.',
  },
  {
    id: 3,
    nombre: 'Empresarial',
    costo: 20,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_20',
    descripcion: 'Para equipos que necesitan mas seguimiento y soporte.',
  },
]

function formatUsd(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDuration(months: number): string {
  if (months === 1) return 'Mensual'
  if (months === 3) return 'Trimestral'
  if (months === 6) return 'Semestral'
  if (months === 12) return 'Anual'
  return `${months} meses`
}

export default function SuscripcionView() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [subscribingPlanId, setSubscribingPlanId] = useState<number | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadPlans() {
      setLoading(true)
      setMessage(null)
      try {
        const res = await fetch('/api/billing/plans', { cache: 'no-store' })
        if (!res.ok) throw new Error('No disponible')

        const data = await res.json()
        const list: Plan[] = Array.isArray(data?.plans) ? data.plans : []

        if (!cancelled) {
          if (list.length > 0) {
            setPlans(list)
            setUsingFallback(false)
          } else {
            setPlans(FALLBACK_PLANS)
            setUsingFallback(true)
          }
        }
      } catch {
        if (!cancelled) {
          setPlans(FALLBACK_PLANS)
          setUsingFallback(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPlans()
    return () => {
      cancelled = true
    }
  }, [])

  const featuredPlanId = useMemo(() => {
    const paidPlans = plans.filter((p) => p.costo > 0)
    if (paidPlans.length === 0) return null
    const sorted = [...paidPlans].sort((a, b) => a.costo - b.costo)
    return sorted[0].id
  }, [plans])

  async function handleSubscribe(planId: number) {
    setMessage(null)
    setSubscribingPlanId(planId)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? 'No se pudo iniciar checkout')
      }

      window.location.href = data.url
    } catch (err) {
      setMessage({
        ok: false,
        text: (err as Error).message || 'No se pudo iniciar el proceso de pago.',
      })
    } finally {
      setSubscribingPlanId(null)
    }
  }

  async function handleOpenPortal() {
    setMessage(null)
    setOpeningPortal(true)

    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? 'No se pudo abrir el portal de facturacion')
      }

      window.location.href = data.url
    } catch (err) {
      setMessage({
        ok: false,
        text: (err as Error).message || 'No se pudo abrir el portal de Stripe.',
      })
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="lg:hidden h-14" />

      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-[#7B6FE8] dark:text-[#91eb78]">Suscripcion</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Elige tu plan y despues podras activarlo con Stripe.
            </p>
          </div>

          <button
            onClick={handleOpenPortal}
            disabled={openingPortal}
            className="rounded-xl border border-slate-300 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {openingPortal ? 'Abriendo...' : 'Administrar plan'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {usingFallback && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Vista en modo diseno: aun no hay conexion completa con Stripe/DB. Puedes ajustar textos, colores y layout.
            </div>
          )}

          {message && (
            <div
              className={[
                'rounded-xl px-4 py-3 text-sm font-medium',
                message.ok
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              ].join(' ')}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((plan) => {
                const isFeatured = featuredPlanId === plan.id
                const isFree = plan.costo === 0
                const isSubscribing = subscribingPlanId === plan.id

                return (
                  <article
                    key={plan.id}
                    className={[
                      'relative rounded-2xl border bg-white dark:bg-zinc-900 p-5 shadow-sm transition-transform duration-150',
                      isFeatured
                        ? 'border-[#7B6FE8] dark:border-[#91eb78] md:-translate-y-1'
                        : 'border-slate-200 dark:border-zinc-800',
                    ].join(' ')}
                  >
                    {isFeatured && (
                      <span className="absolute -top-3 left-5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78] px-3 py-1 text-[11px] font-bold tracking-wide text-white dark:text-zinc-900">
                        Recomendado
                      </span>
                    )}

                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      {plan.nombre}
                    </h2>

                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-black text-slate-900 dark:text-white">{formatUsd(plan.costo)}</p>
                      <span className="pb-1 text-xs text-slate-500 dark:text-zinc-400">/{formatDuration(plan.duracion_meses)}</span>
                    </div>

                    <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300 min-h-10">
                      {plan.descripcion || 'Plan listo para configurarse en Stripe.'}
                    </p>

                    <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-zinc-300">
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78]" />
                        Facturacion segura con Stripe
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78]" />
                        Cancelacion cuando quieras
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78]" />
                        Soporte por correo
                      </li>
                    </ul>

                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isSubscribing || usingFallback || isFree}
                      className={[
                        'mt-6 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        isFeatured
                          ? 'bg-[#7B6FE8] hover:bg-[#6B5FE0] text-white dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] dark:text-zinc-900'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100',
                      ].join(' ')}
                    >
                      {isFree
                        ? 'Plan actual'
                        : isSubscribing
                          ? 'Redirigiendo...'
                          : 'Suscribirme'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
