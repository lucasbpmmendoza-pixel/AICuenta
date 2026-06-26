'use client'

import { useRouter } from 'next/navigation'

interface Props {
  featureName: string
  description?: string
}

/**
 * Reemplaza el contenido principal de una vista bloqueada para freemium.
 * Renderizar en lugar del <main> normal cuando isFreemium=true. El Sidebar
 * se sigue mostrando aparte para que el usuario pueda navegar a Suscripcion.
 */
export default function FreemiumOverlayScreen({ featureName, description }: Props) {
  const router = useRouter()
  return (
    <main className="flex-1 min-w-0 flex flex-col lg:ml-60">
      <div className="lg:hidden h-14" />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]">
            <svg className="h-8 w-8 text-[#7B6FE8] dark:text-[#91EB78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {featureName} esta bloqueado
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
            {description ?? 'Esta funcion esta disponible solo en planes de pago. Mejora tu plan para desbloquearla.'}
          </p>
          <button
            onClick={() => router.push('/dashboard/suscripcion')}
            className="mt-6 w-full rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition"
          >
            Ver planes
          </button>
        </div>
      </div>
    </main>
  )
}
