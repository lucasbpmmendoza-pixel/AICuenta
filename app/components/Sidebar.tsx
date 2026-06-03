'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from '@/app/hooks/useTheme'
import { logAction } from '@/lib/logs'

export type AccountType = 'single' | 'multi'

interface Props {
  userName: string
  accountType: AccountType
  role?: 'owner' | 'member' | 'chikenelo'
  ownerId?: string
  isDemo?: boolean
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
    label: 'Configuracion',
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
    label: 'Suscripcion',
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
    label: 'Asistente IA',
    href: '/dashboard/chat',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Asistente Docs',
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
    label: 'Soporte',
    href: '/dashboard/soporte',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <circle cx="12" cy="17" r=".5" fill="currentColor" />
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

export default function Sidebar({ userName, accountType, role, ownerId, isDemo = false }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dark, toggle } = useTheme()

  const demoEnabled = isDemo

  // isOwner: true solo si role es 'owner' Y no tiene ownerId (subordinados siempre tienen ownerId)
  const isOwner = role === 'owner' && !ownerId

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
      '/dashboard/unete': 'tab_aichikenelo',
    }
    return tabMap[href] ?? null
  }

  function handleNavClick(href: string) {
    const tabName = getTabNameFromHref(href)
    if (tabName) {
      logAction(tabName)
    }
    setMobileOpen(false)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
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
        {accountType === 'multi' && (
          <span className="ml-auto rounded-full bg-[#ebe9fb] dark:bg-[#5E6957] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#7b6fe8] dark:text-[#6BDA4D] font-bold">
            Multi
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href
          const isDisabled = demoEnabled && disabledDemoItems.has(item.href)
          const isDemoFreeItem = demoEnabled && item.href === '/dashboard/chat-docs'
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault()
                if (isDisabled) return
                handleNavClick(item.href)
                router.push(item.href)
              }}
              aria-disabled={isDisabled}
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isDisabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500'
                  : isActive
                  ? 'bg-[#7B6FE8] text-white shadow-sm shadow-[#7B6FE8]/40 dark:shadow-[#91EB78]/40 dark:bg-[#91EB78] dark:text-zinc-900'
                  : 'text-slate-600 hover:bg-[#EBE9FB] hover:text-[#450c7d] dark:text-zinc-400 dark:hover:bg-[#5E6957]  dark:hover:text-[#6BDA4D]',
                isDemoFreeItem ? 'ring-2 ring-inset ring-[#D4A531] dark:ring-[#F2C45A]' : '',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </a>
          )
        })}
      </nav>

      {/* User + theme + logout */}
      <div className="border-t border-slate-200 dark:border-zinc-800 px-3 py-4 space-y-1">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-zinc-400 transition-all hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-[#450c7d] dark:hover:text-[#6BDA4D]"
        >                   
          {dark ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {dark ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-white">
            {initials}
          </div>
          <span className="truncate text-sm font-medium text-slate-700 dark:text-zinc-300">{userName}</span>
        </div>
        {!demoEnabled && (
          <button
            onClick={() => {
              void handleLogout()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-zinc-400 transition-all hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-red-500 dark:hover:text-red-400"
          >                                                                                                                              
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesion
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
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
            aria-label="Abrir menu"
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
              aria-label="Cerrar menu"
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
