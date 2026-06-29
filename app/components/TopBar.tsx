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
    <div className="fixed top-[90px] right-4 z-50 flex flex-col gap-2">
      <button
        onClick={() => router.push('/register')}
        className="flex items-center gap-2 rounded-xl bg-[#7B6FE8] hover:bg-[#6955d4] text-white font-semibold py-2.5 px-6 transition-all shadow-lg dark:bg-[#91EB78] dark:text-zinc-900 dark:hover:bg-[#7ed65a]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        Registrarme
      </button>
      
      <button
        onClick={() => router.push('/login')}
        className="flex items-center gap-2 rounded-xl bg-[#7B6FE8] hover:bg-[#6955d4] text-white font-semibold py-2.5 px-6 transition-all shadow-lg dark:bg-[#91EB78] dark:text-zinc-900 dark:hover:bg-[#7ed65a]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
        Iniciar sesión
      </button>
    </div>
    
  )
}
