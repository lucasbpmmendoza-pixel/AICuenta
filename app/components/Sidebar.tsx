'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from '@/app/hooks/useTheme'
import { logAction } from '@/lib/logs'
import OnboardingBeacon from './OnboardingBeacon'
import OnboardingModal from './OnboardingModal'
import NotificationBell from './NotificationBell'
import FreemiumUpsellModal from './FreemiumUpsellModal'
import { useAuth } from './AuthProvider'
import { FINDOC_CHAT_KEY, FISCALGPT_CHAT_KEY, clearChatMessages } from '@/lib/chat-persistence'
import { clearLocalNotifications } from '@/lib/local-notifications'

// Rutas bloqueadas para freemium (FinDoc, Scan Bot, AIChikenelo).
// FiscalGPT (/dashboard/chat-docs) queda permitido.
const FREEMIUM_BLOCKED_HREFS = new Set<string>([
  '/dashboard/chat',
  '/dashboard/comprobantes',
  '/dashboard/unete',
])

const FREEMIUM_LABELS: Record<string, string> = {
  '/dashboard/chat': 'FinDoc',
  '/dashboard/comprobantes': 'Scan Bot',
  '/dashboard/unete': 'AIChikenelo',
}

export type AccountType = 'single' | 'multi'

interface Props {
  userName: string
  accountType: AccountType
  role?: 'owner' | 'member' | 'chikenelo'
  ownerId?: string
  isDemo?: boolean
  showBeacons?: boolean
  onDismissBeacons?: () => void
}

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  onlyMulti?: boolean
  ownerOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'Facturas',
    href: '/dashboard/facturas',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    label: 'Estados Financieros',
    href: '/dashboard/estados-financieros',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
  },
  {
    label: 'RFCs',
    href: '/dashboard/rfcs',
    onlyMulti: true,
    ownerOnly: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Usuarios',
    href: '/dashboard/usuarios',
    onlyMulti: true,
    ownerOnly: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Configuración',
    href: '/dashboard/configuracion',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    label: 'Suscripción',
    href: '/dashboard/suscripcion',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 15h4" />
      </svg>
    ),
  },
  {
    label: 'FinDoc',
    href: '/dashboard/chat',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'FiscalGPT',
    href: '/dashboard/chat-docs',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    ),
  },
  {
    label: 'Scan Bot',
    href: '/dashboard/comprobantes',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4v17l2.5-1.5L9 21l2.5-1.5L14 21l2.5-1.5L19 21l1-.6V4l-1 .6L16.5 3 14 4.5 11.5 3 9 4.5 6.5 3z" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    label: 'AIChikenelo',
    href: '/dashboard/unete',
    icon: (
      <svg className="h-6 w-6" viewBox="0 2 24 24" xmlns="http://www.w3.org/2000/svg" >
        <g transform="translate(0.5 0.2)">
          {/* cresta */}
          <circle cx="3.5" cy="7" r="2" fill="currentColor" />
          <circle cx="4" cy="5" r="2" fill="currentColor" />
          <circle cx="5" cy="3.5" r="2" fill="currentColor" />
          <circle cx="6" cy="5" r="2" fill="currentColor" />
          <circle cx="7" cy="3.6" r="2" fill="currentColor" />
          <circle cx="8.5" cy="4.5" r="2" fill="currentColor" />

          {/* cabeza/cuello/cuerpo */}
          <path d="M4.7 8.5c.9-1.5 2.5-2.3 4.2-2.3 2.7 0 5 2.1 5.2 4.8A2.7 2.7 0 0 0 14 12v6.3c0 2.7-2.2 4.9-4.9 4.9H8.9C6.2 23.2 4 21 4 18.3V11c0-1.5.8-2.9 2.1-3.9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

          {/* cola */}
          <path d="M16 10.3h2a1.1 1.4 0 0 1 1.1 2.2l-1.5 1.9 1.5 1.8a1.4 1.4 0 0 1-1.1 2.1h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

          {/* ojo */}
          <circle cx="10" cy="10" r="2" fill="currentColor" />
</g>
      </svg>
    ),
  },
]

export default function Sidebar({ userName, accountType, role, ownerId, isDemo = false, showBeacons, onDismissBeacons }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dark, toggle } = useTheme()
  const { user } = useAuth()
  const isFreemium = !isDemo && Boolean(user?.isFreemium)
  const [upsellFor, setUpsellFor] = useState<string | null>(null)

  const demoEnabled = isDemo

  // isOwner: true solo si role es 'owner' Y no tiene ownerId (subordinados siempre tienen ownerId)
  const isOwner = role === 'owner' && !ownerId

  // hrefs que reciben beacon en onboarding
  const BEACON_HREFS = ['/dashboard', '/dashboard/facturas', '/dashboard/estados-financieros', '/dashboard/chat', '/dashboard/chat-docs', '/dashboard/unete']
  const BEACON_HREFS_SET = new Set(BEACON_HREFS)
  const VISITED_KEY = 'aicuenta_beacons_visited'
  const BEACONS_DONE_KEY = 'aicuenta_beacons_done'
  const isShowBeaconsControlled = showBeacons !== undefined

  const [internalShowBeacons, setInternalShowBeacons] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [floatingOpen, setFloatingOpen] = useState(false)

  useEffect(() => {
    if (isShowBeaconsControlled) {
      setInternalShowBeacons(Boolean(showBeacons))
      return
    }
    // Keep beacons active by default (manual modal only), until user completes/dismisses beacon flow.
    if (typeof window === 'undefined') return
    const beaconsDismissed = localStorage.getItem(BEACONS_DONE_KEY)
    setInternalShowBeacons(!beaconsDismissed)
  }, [isShowBeaconsControlled, showBeacons])

  const beaconsEnabled = isShowBeaconsControlled ? Boolean(showBeacons) : internalShowBeacons

  // Tracks which beacon routes the user has actually visited
  const [visitedBeacons, setVisitedBeacons] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(VISITED_KEY)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })

  // Mark current page as visited when pathname changes
  useEffect(() => {
    if (!beaconsEnabled) return
    if (!BEACON_HREFS_SET.has(pathname)) return
    setVisitedBeacons((prev) => {
      if (prev.has(pathname)) return prev
      const next = new Set(prev)
      next.add(pathname)
      try { localStorage.setItem(VISITED_KEY, JSON.stringify([...next])) } catch {}
      // All beacons visited -> signal parent to hide
      if (BEACON_HREFS.every((h) => next.has(h))) {
        try { localStorage.setItem(BEACONS_DONE_KEY, '1') } catch {}
        setInternalShowBeacons(false)
        if (onDismissBeacons) onDismissBeacons()
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, beaconsEnabled])

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.onlyMulti && accountType !== 'multi') return false
    if (item.ownerOnly && !isOwner) return false
    return true
  })

  const disabledDemoItems = new Set<string>()

  function getTabNameFromHref(href: string): string | null {
    const tabMap: Record<string, string> = {
      '/dashboard': 'tab_dashboard',
      '/dashboard/rfcs': 'tab_rfc',
      '/dashboard/usuarios': 'tab_usuarios',
      '/dashboard/chat': 'tab_asistente_ia',
      '/dashboard/chat-docs': 'tab_asistente_docs',
      '/dashboard/comprobantes': 'tab_comprobantes',
      '/dashboard/unete': 'tab_aichikenelo',
    }
    return tabMap[href] ?? null
  }

  function handleNavClick(href: string, isBeaconHref = false) {
    const tabName = getTabNameFromHref(href)
    if (tabName) {
      logAction(tabName)
    }
    if (isBeaconHref && beaconsEnabled) {
      setVisitedBeacons((prev) => {
        if (prev.has(href)) return prev
        const next = new Set(prev)
        next.add(href)
        try { localStorage.setItem(VISITED_KEY, JSON.stringify([...next])) } catch {}
        if (BEACON_HREFS.every((h) => next.has(h))) {
          try { localStorage.setItem(BEACONS_DONE_KEY, '1') } catch {}
          setInternalShowBeacons(false)
          if (onDismissBeacons) onDismissBeacons()
        }
        return next
      })
    }
    setMobileOpen(false)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Borrar conversaciones guardadas para que no queden visibles al próximo usuario
    clearChatMessages(FINDOC_CHAT_KEY)
    clearChatMessages(FISCALGPT_CHAT_KEY)
    clearLocalNotifications()
    router.push('/login')
  }

  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const navContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-4 px-2 py-1 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-center" style={{ width: 75, height: 75 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dark ? '/logo6-negro.png' : '/logo6-blanco.png'} alt="AIcuenta" style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
        </div>
        <span className="  text-sm font-black tracking-tight text-[#7b6fe8] dark:text-[#91EB78]">AIcuenta</span>
        <div className="ml-auto flex items-center gap-1.5">
          {accountType === 'multi' && (
            <span className="rounded-full bg-[#ebe9fb] dark:bg-[#5E6957] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#7b6fe8] dark:text-[#6BDA4D] font-bold">
              Multi
            </span>
          )}
          <NotificationBell align="left" />
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href
          const isDisabled = demoEnabled && disabledDemoItems.has(item.href)
          const isDemoFreeItem = demoEnabled && item.href === '/dashboard/chat-docs'
          const isFreemiumLocked = isFreemium && FREEMIUM_BLOCKED_HREFS.has(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault()
                if (isDisabled) return
                if (isFreemiumLocked) {
                  logAction('freemium_upsell_open')
                  setUpsellFor(item.href)
                  return
                }
                handleNavClick(item.href, BEACON_HREFS_SET.has(item.href))
                router.push(item.href)
              }}
              aria-disabled={isDisabled}
              className={[
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isDisabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500'
                  : isFreemiumLocked
                  ? 'text-slate-500 dark:text-zinc-500 hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] cursor-pointer'
                  : isActive
                  ? 'bg-[#7B6FE8] text-white shadow-sm shadow-[#7B6FE8]/40 dark:shadow-[#91EB78]/40 dark:bg-[#91EB78] dark:text-zinc-900'
                  : 'text-slate-600 hover:bg-[#EBE9FB] hover:text-[#450c7d] dark:text-zinc-400 dark:hover:bg-[#5E6957]  dark:hover:text-[#6BDA4D]',
                isDemoFreeItem ? 'ring-2 ring-inset ring-[#D4A531] dark:ring-[#F2C45A]' : '',
              ].join(' ')}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {isFreemiumLocked && (
                <svg className="h-4 w-4 text-slate-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Bloqueado">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
              {beaconsEnabled && BEACON_HREFS_SET.has(item.href) && !visitedBeacons.has(item.href) && (
                <OnboardingBeacon
                  position="top-right"
                  color={item.href === '/dashboard/chat' || item.href === '/dashboard/chat-docs' ? 'green' : item.href === '/dashboard/unete' ? 'amber' : 'brand'}
                  size={12}
                />
              )}
            </a>
          )
        })}
      </nav>

            {/* User + theme + logout */}
      <div className="border-t border-slate-200 dark:border-zinc-800 px-3 py-6 space-y-1">
        {/* Usuario + toggle de tema en una fila */}
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-white">
            {initials}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-zinc-300">{userName}</span>

          {/* Switch de tema — transición lenta (700ms) y morph sol/luna */}
          <button
            onClick={toggle}
            role="switch"
            aria-checked={dark}
            aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-700 ease-in-out',
              dark ? 'bg-[#5E6957]' : 'bg-[#EBE9FB]', // hover 'bg-[#5E6957]' : 'bg-[#EBE9FB]'  SELECT 'bg-[#91EB78]' : 'bg-[#7B6FE8]'
            ].join(' ')}
          >
            <span
              className={[
                'relative inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform duration-700 ease-in-out',
                dark ? 'translate-x-5' : 'translate-x-0.5',
              ].join(' ')}
            >
              {/* Sol: visible en claro, gira y se encoge al pasar a oscuro */}
              <svg
                className={[
                  'absolute inset-0 m-auto h-3 w-3 text-amber-500 transition-all duration-700 ease-in-out',
                  dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
                ].join(' ')}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="22" />
                <line x1="2" y1="12" x2="4" y2="12" />
                <line x1="20" y1="12" x2="22" y2="12" />
                <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
                <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
                <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
                <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
              </svg>
              {/* Luna: oculta en claro, gira y crece al pasar a oscuro */}
              <svg
                className={[
                  'absolute inset-0 m-auto h-3 w-3 text-zinc-700 transition-all duration-700 ease-in-out',
                  dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
                ].join(' ')}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </span>
          </button>
        </div>

        {!demoEnabled && (
          <button
            onClick={() => {
              void handleLogout()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 dark:text-zinc-400 transition-all hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-red-500 dark:hover:text-red-400"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Modal de ayuda (siempre montado para que el menú flotante funcione en cualquier vista) */}
      <OnboardingModal
        userName={userName}
        forceOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        onDone={() => setShowHelpModal(false)}
      />

      {/* Modal de upsell para rutas bloqueadas en freemium */}
      <FreemiumUpsellModal
        open={upsellFor !== null}
        onClose={() => setUpsellFor(null)}
        featureName={upsellFor ? FREEMIUM_LABELS[upsellFor] : undefined}
      />

      {/* ── Menú flotante derecho (Soporte + Ayuda) ── */}
      <div className="fixed right-0 top-3/4 z-40 -translate-y-1/2 ">
        <div
          className={[
            'flex items-stretch transition-transform duration-300 ease-out',
            floatingOpen ? 'translate-x-0' : 'translate-x-48',
          ].join(' ')}
        >
          {/* Pestaña: abre/cierra el panel (se desplaza junto con el panel) */}
          <button
            type="button"
            onClick={() => setFloatingOpen((v) => !v)}
            aria-label={floatingOpen ? 'Ocultar ayuda y soporte' : 'Mostrar ayuda y soporte'}
            aria-expanded={floatingOpen}
            className="flex shrink-0 items-center self-center rounded-l-xl bg-[#7B6FE8] px-0.5 py-5 text-white shadow-lg transition-colors hover:bg-[#6a5ed6] dark:bg-[#91EB78] dark:text-zinc-900 dark:hover:bg-[#7fd968]"
          >
            <svg
              className={['h-5 w-5 transition-transform duration-300', floatingOpen ? 'rotate-180' : ''].join(' ')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Panel desplegable */}
          <div className="flex w-48 shrink-0 flex-col justify-center gap-2 rounded-l-2xl border-y border-l border-slate-200 bg-white px-3 py-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => {
                setFloatingOpen(false)
                setMobileOpen(false)
                router.push('/dashboard/soporte')
              }}
              className="flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-[#EBE9FB] hover:text-[#450c7d] dark:text-zinc-400 dark:hover:bg-[#5E6957] dark:hover:text-[#6BDA4D]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                <path d="M21 14v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
                <path d="M3 14v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                <path d="M19 19v1a3 3 0 0 1-3 3h-3" />
              </svg>
              Soporte
            </button>

            <button
              type="button"
              onClick={() => {
                setFloatingOpen(false)
                setShowHelpModal(true)
              }}
              className="flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-[#EBE9FB] hover:text-[#450c7d] dark:text-zinc-400 dark:hover:bg-[#5E6957] dark:hover:text-[#6BDA4D]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="17" r=".5" fill="currentColor" />
              </svg>
              Ayuda
            </button>
          </div>
        </div>
      </div>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-60 flex-col bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 z-20 overflow-hidden">        {navContent}
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-black text-slate-900 dark:text-white">AI</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell align="right" />
          <button
            onClick={toggle}
            className="rounded-lg p-1.5 text-slate-500 dark:text-zinc-400 hover:bg-[#EBE9FB] dark:hover:bg-zinc-800 transition"
            aria-label="Cambiar tema"
          >
            {dark ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 dark:text-zinc-400 hover:bg-[#EBE9FB] dark:hover:bg-zinc-800 transition"
            aria-label="Abrir menú"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-white dark:bg-zinc-900 h-full shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 dark:text-zinc-400 hover:bg-[#EBE9FB] dark:hover:bg-zinc-800 transition"
              aria-label="Cerrar menú"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
