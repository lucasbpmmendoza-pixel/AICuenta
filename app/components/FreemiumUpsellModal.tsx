'use client'

import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onClose: () => void
  featureName?: string
}

export default function FreemiumUpsellModal({ open, onClose, featureName }: Props) {
  const router = useRouter()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          aria-label="Cerrar"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]">
          <svg className="h-7 w-7 text-[#7B6FE8] dark:text-[#91EB78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-900 dark:text-white">
          {featureName ? `${featureName} está bloqueado` : 'Función bloqueada'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-zinc-400">
          Esta función está disponible solo en planes de pago. Mejora tu plan para
          desbloquearla, acceder a tu historial de los últimos 5 años y aprovechar
          todo AIcuenta.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => {
              onClose()
              router.push('/dashboard/suscripcion')
            }}
            className="w-full rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition"
          >
            Ver planes
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
