'use client'

import { useRouter } from 'next/navigation'
import { useMembership } from './MembershipProvider'

interface Props {
  /** Mensaje contextual. Si se omite, se usa el genérico. */
  message?: string
}

/**
 * Banner sticky para vistas en las que el usuario free puede navegar
 * pero no interactuar (Facturas, Estados Financieros, Comprobantes, etc.).
 * Si la cuenta es de pago no renderiza nada.
 */
export default function FreemiumBanner({ message }: Props) {
  const { isFree, loading } = useMembership()
  const router = useRouter()

  if (loading || !isFree) return null

  return (
    <div className="sticky top-0 z-20 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between gap-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 min-w-0">
        <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200 truncate">
          {message ?? 'Plan gratis: solo el mes en curso esta disponible. Suscribete para desbloquear el resto.'}
        </p>
      </div>
      <button
        onClick={() => router.push('/dashboard/suscripcion')}
        className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-zinc-900 px-3 py-1 text-xs font-bold whitespace-nowrap transition"
      >
        Ver planes
      </button>
    </div>
  )
}
