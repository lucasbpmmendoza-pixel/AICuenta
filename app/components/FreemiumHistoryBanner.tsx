'use client'

import { useRouter } from 'next/navigation'

export default function FreemiumHistoryBanner() {
  const router = useRouter()
  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Solo puedes ver el mes actual
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            Para acceder a los ultimos 5 anos de tu historial y descargar reportes,
            necesitas un plan de pago.
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/suscripcion')}
          className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          Ver planes
        </button>
      </div>
    </div>
  )
}
