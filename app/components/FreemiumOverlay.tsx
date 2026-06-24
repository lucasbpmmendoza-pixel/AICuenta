'use client'

import { useRouter } from 'next/navigation'

interface Props {
  /** Si false, el overlay no se monta (los hijos quedan totalmente normales) */
  active: boolean
  /** Render de los hijos detras del overlay (vista en modo lectura) */
  children: React.ReactNode
  /** Titulo del overlay */
  title?: string
  /** Bajada del overlay */
  description?: string
  /**
   * Variante:
   * - "block": tapa toda la vista con un panel central (RFCs, Usuarios).
   * - "banner": agrega solo una barra arriba avisando que es solo lectura.
   */
  variant?: 'block' | 'banner'
}

export default function FreemiumOverlay({
  active,
  children,
  title = 'Mejora tu plan',
  description = 'Esta seccion solo esta disponible para cuentas de pago. Suscribete para desbloquearla.',
  variant = 'block',
}: Props) {
  const router = useRouter()

  if (!active) return <>{children}</>

  if (variant === 'banner') {
    return (
      <div className="relative">
        <div className="sticky top-0 z-20 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 22h20L12 2z" />
              <line x1="12" y1="9" x2="12" y2="14" />
              <circle cx="12" cy="17" r="0.5" fill="currentColor" />
            </svg>
            <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200 truncate">
              Plan gratis: vista en modo lectura. {description}
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/suscripcion')}
            className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-zinc-900 px-3 py-1 text-xs font-bold whitespace-nowrap transition"
          >
            Ver planes
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="relative min-h-[60vh]">
      {/* Vista deshabilitada de fondo */}
      <div className="pointer-events-none select-none opacity-30 blur-[1px]">{children}</div>

      {/* Panel central */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]">
            <svg className="h-6 w-6 text-[#7B6FE8] dark:text-[#91EB78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 className="text-lg font-black text-[#450c7d] dark:text-white">{title}</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">{description}</p>
          <button
            onClick={() => router.push('/dashboard/suscripcion')}
            className="mt-5 w-full rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91EB78] dark:hover:bg-[#83dd6a] text-white dark:text-zinc-900 py-2.5 text-sm font-bold transition"
          >
            Ver planes
          </button>
        </div>
      </div>
    </div>
  )
}
