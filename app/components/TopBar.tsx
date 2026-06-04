'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function TopBar({ initialDemoMode, isDemo }: { initialDemoMode?: boolean; isDemo?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  // Keep server-confirmed demo state so client cookie quirks cannot hide the button.
  const [demoMode, setDemoMode] = useState(!!initialDemoMode || !!isDemo)
  const [isRegistered, setIsRegistered] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Re-check cookie, but never downgrade if server already confirmed demo mode.
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';')
      const hasDemo = cookies.some(c => c.trim().startsWith('demo_mode=1'))
      setDemoMode(hasDemo || !!initialDemoMode || !!isDemo)
    }

    // auth_token is httpOnly, so we verify auth state via API on each route change.
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setIsRegistered(false)
          return
        }

        const data = await res.json()
        const userId = data?.user?.id
        const hasRealSession = !!userId && userId !== 'demo-user'
        if (!cancelled) setIsRegistered(hasRealSession)
      } catch {
        if (!cancelled) setIsRegistered(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialDemoMode, isDemo, pathname])

  const hiddenPaths = ['/login', '/register', '/forgot-password', '/reset-password']
  const hideOnAuthRoutes = hiddenPaths.some((path) => pathname === path || pathname.startsWith(path + '/'))

  if (!demoMode || isRegistered || hideOnAuthRoutes) return null

  return (
    <div className="fixed top-[90px] right-0 z-50 p-6">
      <button
        onClick={() => router.push('/register')}
        className="flex items-center gap-2 rounded-xl bg-[#7B6FE8] hover:bg-[#6955d4] text-white font-semibold py-2.5 px-6 transition-all shadow-lg dark:bg-[#91EB78] dark:text-zinc-900 dark:hover:bg-[#7ed65a]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
        Registrarme
      </button>
    </div>
  )
}
