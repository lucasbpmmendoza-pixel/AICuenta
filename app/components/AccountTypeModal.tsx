'use client'

import { useEffect, useState } from 'react'

export type AccountType = 'multi' | 'single'

const OPTIONS: { value: AccountType; title: string; description: string; icon: string }[] = [
  {
    value: 'multi',
    title: 'Contador independiente o despacho',
    description: 'Manejo varios RFCs de distintos clientes',
    icon: '👥',
  },
  {
    value: 'single',
    title: 'Negocio propio',
    description: 'Facturo de forma independiente',
    icon: '👤',
  },
]

interface Props {
  show: boolean
  onComplete: (type: AccountType) => void
}

export default function AccountTypeModal({ show, onComplete }: Props) {
  const [visible, setVisible] = useState(false)
  const [selected, setSelected] = useState<AccountType | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (show) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
    }
  }, [show])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await fetch('/api/auth/account-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_type: selected }),
      })
      setVisible(false)
      setTimeout(() => onComplete(selected), 300)
    } catch {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    /* Backdrop */
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4',
        'transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* Card */}
      <div
        className={[
          'w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden',
          'transition-all duration-300',
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
        ].join(' ')}
      >
        {/* Top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#450c7d] to-[#450c7d]" />

        <div className="px-7 py-7">
          {/* Header */}
          <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500" style={{ color: "#7B6FE8" }}>
            Configuracion inicial
          </p>
          <h2 className="mt-2 text-xl font-black text-zinc-900 dark:text-zinc-50 leading-snug" style={{ color: "#450c7d" }}>
            Usaras esta herramienta como…
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400" style={{ color: "#7B6FE8" }}>
            Elige el perfil que mejor describe tu uso. Podras cambiarlo despues desde tu cuenta.
          </p>

          {/* Options */}
          <div className="mt-6 flex flex-col gap-3">
            {OPTIONS.map((opt) => {
              const isSelected = selected === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={[
                    'flex items-start gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all duration-150 cursor-pointer',
                    isSelected
                      ? 'border-[#4833d6] bg-white dark:bg-[#450c7d]'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-[#7B6FE8] dark:hover:border-[#7B6FE8] bg-white dark:bg-zinc-800',
                  ].join(' ')}
                >
                  <span className="text-2xl leading-none mt-0.5">{opt.icon}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className={[
                      'text-sm font-bold leading-tight',
                      isSelected ? 'text-[#4833d6] dark:text-[#7B6FE8]' : 'text-zinc-800 dark:text-zinc-100',
                    ].join(' ')}>
                      {opt.title}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {opt.description}
                    </span>
                  </div>
                  {/* Check indicator */}
                  <span className={[
                    'ml-auto mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150',
                    isSelected
                      ? 'border-[#4833d6] bg-[#4833d6]'
                      : 'border-zinc-300 dark:border-zinc-600',
                  ].join(' ')}>
                    {isSelected && (
                      <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || saving}
            className={[
              'mt-6 w-full rounded-xl py-3 text-sm font-bold transition-all duration-150',
              selected && !saving
                ? 'bg-[#450c7d] hover:bg-[#7B6FE8] text-white cursor-pointer'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? 'Guardando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
