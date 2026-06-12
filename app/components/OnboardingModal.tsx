'use client'

import { useEffect, useState } from 'react'

interface Step {
  title: string
  description: string
  icon: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Bienvenido a AIcuenta',
    description:
      'Tu plataforma de inteligencia fiscal. En menos de un minuto te mostramos como sacarle el maximo provecho.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: 'Dashboard',
    description:
      'Aqui ves de un vistazo tus ingresos, egresos, IVA e ISR del mes. Usa las flechas para navegar entre meses.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    title: 'Facturas',
    description:
      'Descarga tus CFDIs en Excel por mes, trimestre o año. Filtra por RFC, tipo de comprobante y mas.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    title: 'Estados Financieros',
    description:
      'Consulta resumenes como estado de resultados, balance y flujo para entender la salud financiera de tu negocio en periodos concretos.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
  },
  {
    title: 'FinDoc',
    description:
      'Analiza tus propios datos y responde preguntas sobre tus cifras: IVA, ISR, ingresos, egresos y tendencias de tus periodos.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Asistente Fiscal',
    description:
      'Te orienta con reglas y criterios fiscales (SAT, obligaciones, conceptos). Diferencia clave: este explica normativa; FinDoc analiza tus datos reales.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    ),
  },
  {
    title: 'AIChikenelo',
    description:
      'Es tu asistente de acompanamiento estrategico: te sugiere enfoques, prioriza acciones y te ayuda a convertir tus datos en decisiones practicas para el negocio.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 2 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(0.5 0.2)">
          <circle cx="3.5" cy="7" r="2" fill="currentColor" />
          <circle cx="4" cy="5" r="2" fill="currentColor" />
          <circle cx="5" cy="3.5" r="2" fill="currentColor" />
          <circle cx="6" cy="5" r="2" fill="currentColor" />
          <circle cx="7" cy="3.6" r="2" fill="currentColor" />
          <circle cx="8.5" cy="4.5" r="2" fill="currentColor" />
          <path d="M4.7 8.5c.9-1.5 2.5-2.3 4.2-2.3 2.7 0 5 2.1 5.2 4.8A2.7 2.7 0 0 0 14 12v6.3c0 2.7-2.2 4.9-4.9 4.9H8.9C6.2 23.2 4 21 4 18.3V11c0-1.5.8-2.9 2.1-3.9Z" />
          <path d="M16 10.3h2a1.1 1.4 0 0 1 1.1 2.2l-1.5 1.9 1.5 1.8a1.4 1.4 0 0 1-1.1 2.1h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
        </g>
      </svg>
    ),
  },
  {
    title: 'Todo listo',
    description:
      'Ya conoces lo esencial. Los indicadores parpadeantes en el menu te van a guiar a las secciones destacadas. Empieza a explorar.',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
]

interface Props {
  userName?: string
  onDone?: () => void
  forceOpen?: boolean
  onClose?: () => void
}

export default function OnboardingModal({ userName, onDone, forceOpen = false, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!forceOpen) return
    setStep(0)
    setVisible(true)
  }, [forceOpen])

  function dismiss() {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      setExiting(false)
      onClose?.()
      onDone?.()
    }, 280)
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      dismiss()
    }
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1)
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  return (
    /* Backdrop */
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
    >
      {/* Card */}
      <div
        className={`relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden transition-all duration-300 ${exiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        {/* Top gradient bar */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #450c7d, #7b6fe8, #91eb78)' }} />

        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          aria-label="Cerrar"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="px-8 pt-8 pb-6">
          {/* Icon */}
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #ebe9fb, #e8fde0)' }}
          >
            <span className="text-[#450c7d]">{current.icon}</span>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {isFirst && userName ? `Hola, ${userName.split(' ')[0]}` : current.title}
          </h2>

          {/* Description */}
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-zinc-400">
            {current.description}
          </p>

          {/* Progress dots */}
          <div className="mt-6 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 24 : 6,
                  background: i === step ? '#7b6fe8' : '#e2e0f9',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-3">
            {!isFirst ? (
              <button
                onClick={prev}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
              >
                Atras
              </button>
            ) : (
              <button
                onClick={dismiss}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition"
              >
                Saltar
              </button>
            )}

            <button
              onClick={next}
              className="flex-1 rounded-xl py-2.5 px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #450c7d, #7b6fe8)' }}
            >
              {isLast ? 'Empezar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
