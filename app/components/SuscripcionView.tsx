'use client'

import { useEffect, useMemo, useState } from 'react'

type Plan = {
  id: number
  nombre: string
  costo: number
  duracion_meses: number
  stripe_price_id: string | null
  descripcion: string | null
  cfdis_5_anios: number | null
  requiere_contacto: boolean
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: 1,
    nombre: 'Plan 1',
    costo: 240,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_1',
    descripcion: 'Empieza con lo básico y prueba el panel.',
    cfdis_5_anios: 6000,
    requiere_contacto: false,
  },
  {
    id: 2,
    nombre: 'Plan 2',
    costo: 450,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_2',
    descripcion: 'Ideal para llevar el control mensual de tu operación.',
    cfdis_5_anios: 10000,
    requiere_contacto: false,
  },
  {
    id: 3,
    nombre: 'Plan 3',
    costo: 800,
    duracion_meses: 1,
    stripe_price_id: 'price_mock_3',
    descripcion: 'Para equipos que necesitan más seguimiento y soporte.',
    cfdis_5_anios: 20000,
    requiere_contacto: false,
  },
]

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value)
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
        const res = await fetch('/api/billing/plans', {
          method: 'GET',
          credentials: 'include',
        })
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

  // Separa los planes normales del plan corporativo (precio personalizado)
  const { planesNormales, planCorporativo } = useMemo(() => {
    const normales = plans
      .filter((p) => !p.requiere_contacto)
      .sort((a, b) => a.costo - b.costo)
    const corp = plans.find((p) => p.requiere_contacto) ?? null
    return { planesNormales: normales, planCorporativo: corp }
  }, [plans])

  // Plan 2 (el segundo mas economico) es el recomendado
  const featuredPlanId = useMemo(
    () => planesNormales[1]?.id ?? null,
    [planesNormales],
  )

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

  function handleContactSales() {
    setMessage({
      ok: true,
      text: 'Para el plan Corporativo un asesor te contactara. Escribenos a ventas@aicuenta.com con tu volumen de facturas por mes.',
    })
  }

  async function handleOpenPortal() {
    setMessage(null)
    setOpeningPortal(true)

    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? 'No se pudo abrir el portal de facturación')
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
            <h1 className="text-lg font-bold text-[#7B6FE8] dark:text-[#91eb78]">Suscripción</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Elige tu plan y después podrás activarlo con Stripe.
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                {planesNormales.map((plan) => {
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
                        <span className="absolute -top-3 left-5 z-10 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78] px-3 py-1 text-[11px] font-bold tracking-wide text-white dark:text-zinc-900 shadow-sm">
                          Recomendado
                        </span>
                      )}

                      {/* Lazo diagonal transparente: lo mas LARGO posible (extremos fuera del wrapper) y lo mas DELGADO posible */}
                      <div className="pointer-events-none absolute top-0 right-0 h-20 w-200 overflow-hidden rounded-tr-2xl">
                        <div className="absolute top-6 -right-10 w-35 rotate-45 border-y border-amber-500/70 dark:border-amber-400/70 text-center py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-500 dark:text-amber-400">
                          30 días gratis
                        </div>
                      </div>

                      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        {plan.nombre}
                      </h2>

                      <div className="mt-3 flex items-end gap-2">
                        <p className="text-3xl font-black text-slate-900 dark:text-white">{formatMoney(plan.costo)}</p>
                        <span className="pb-1 text-xs text-slate-500 dark:text-zinc-400">/{formatDuration(plan.duracion_meses)}</span>
                      </div>

                      {plan.cfdis_5_anios != null && (
                        <p className="mt-2 text-xs font-semibold text-[#7B6FE8] dark:text-[#91eb78]">
                          
                        </p>
                      )}

                      <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300 min-h-10">
                        {plan.descripcion || 'Plan listo para configurarse en Stripe.'}
                      </p>

                      <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-zinc-300">
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78]" />
                          Facturación segura con Stripe
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#7B6FE8] dark:bg-[#91eb78]" />
                          Cancelación cuando quieras
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

              {planCorporativo && (
                <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-zinc-900 dark:to-zinc-800 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                  <div>
                    <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide text-white mb-3">
                      Corporativo
                    </span>
                    <h2 className="text-xl font-bold text-white">{planCorporativo.nombre}</h2>
                    {/* Hardcodeado: el plan corporativo NO muestra precio (es personalizado) */}
                    <p className="mt-2 max-w-xl text-sm text-slate-300">
                      Para empresas con más de 80,000 CFDIs. Precio y condiciones a la medida
                      según tu volumen de facturas por mes. Un asesor te arma una cotización.
                    </p>
                  </div>
                  <button
                    onClick={handleContactSales}
                    className="whitespace-nowrap rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition"
                  >
                    Contactar ventas
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
