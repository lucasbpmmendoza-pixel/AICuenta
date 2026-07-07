'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  markLocalRead,
  markAllLocalRead,
  isLocalNotificationId,
  getLocalNotificationsSnapshot,
  getLocalNotificationsServerSnapshot,
  subscribeLocalNotifications,
} from '@/lib/local-notifications'
import {
  markCalendarRead,
  markAllCalendarRead,
  isCalendarNotificationId,
  getCalendarNotificationsSnapshot,
  getCalendarNotificationsServerSnapshot,
  subscribeCalendarNotifications,
} from '@/lib/calendar-notifications'

interface NotificationItem {
  id:         string
  title:      string
  body:       string | null
  type:       'info' | 'warning' | 'success' | 'error'
  link:       string | null
  is_read:    boolean
  created_at: string
}

const POLL_INTERVAL = 60_000 // 60 segundos

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'Ahora'
  if (m < 60) return `Hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Hace ${h} h`
  const d = Math.floor(h / 24)
  return `Hace ${d} d`
}

const TYPE_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
}

// Ancho fijo del panel (debe coincidir con la clase Tailwind `w-80` = 320 px),
// usado para calcular la posición horizontal cuando se ancla por la izquierda.
const PANEL_WIDTH = 320

export default function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const router = useRouter()
  const [open,        setOpen]        = useState(false)
  const [serverItems, setServerItems] = useState<NotificationItem[]>([])
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // El portal necesita document.body; en SSR aún no existe.
  useEffect(() => setMounted(true), [])

  // Notificaciones locales: lectura reactiva del almacén externo (localStorage).
  // Se actualiza solo cuando cambian (p. ej. cuando una IA termina de responder).
  const localItems = useSyncExternalStore(
    subscribeLocalNotifications,
    getLocalNotificationsSnapshot,
    getLocalNotificationsServerSnapshot,
  )

  // Recordatorios mensuales por calendario (día 5 auditoría, 16 pago, 25 cierre).
  const calendarItems = useSyncExternalStore(
    subscribeCalendarNotifications,
    getCalendarNotificationsSnapshot,
    getCalendarNotificationsServerSnapshot,
  )

  const fetchServer = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setServerItems(data.items ?? [])
    } catch {
      // silencioso — si la base no responde, se siguen mostrando las locales
    }
  }, [])

  // Carga inicial + sondeo de las notificaciones del servidor
  useEffect(() => {
    // Disparo de la primera carga al montar (la actualización de estado ocurre
    // tras el await, de forma asíncrona): intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchServer()
    const interval = setInterval(fetchServer, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchServer])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Calcular la posición del panel a partir del botón. Como el panel se
  // renderiza en un portal con position:fixed, no le afecta el overflow:hidden
  // del sidebar y queda por encima de cualquier contenido.
  const updatePosition = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const top = rect.bottom + 8 // ~mt-2
    const left =
      align === 'left'
        ? Math.max(8, rect.left)
        : Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, rect.right - PANEL_WIDTH))
    setPos({ top, left })
  }, [align])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  // Recordatorios de calendario + locales + servidor, todo ordenado por fecha
  const items: NotificationItem[] = [...calendarItems, ...localItems, ...serverItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const unreadCount = items.filter((n) => !n.is_read).length
  const hasUnread = unreadCount > 0

  async function markOne(id: string) {
    if (isCalendarNotificationId(id)) {
      markCalendarRead(id)
      return
    }
    if (isLocalNotificationId(id)) {
      markLocalRead(id)
      return
    }
    setServerItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => {})
  }

  async function markAll() {
    markAllCalendarRead()
    markAllLocalRead()
    setServerItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read-all' }),
    }).catch(() => {})
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.is_read) await markOne(item.id)
    setOpen(false)
    if (item.link) router.push(item.link)
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-label="Notificaciones"
        className="relative flex items-center justify-center h-8 w-8 rounded-xl text-slate-500 dark:text-zinc-400 hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-[#450c7d] dark:hover:text-[#6BDA4D] transition-all"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel — renderizado en portal a document.body con position:fixed
          y z-index muy alto, para que ningún overflow:hidden ni stacking context
          lo recorte ni lo tape. */}
      {open && mounted && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH, zIndex: 9999 }}
          className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
              Notificaciones
              {hasUnread && (
                <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-[9px] font-bold text-rose-600 dark:text-rose-400">
                  {unreadCount}
                </span>
              )}
            </span>
            {hasUnread && (
              <button
                onClick={markAll}
                className="text-[11px] text-[#7b6fe8] dark:text-[#91EB78] hover:underline font-medium"
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 dark:divide-zinc-800">
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <svg className="h-8 w-8 text-slate-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p className="text-xs text-slate-400 dark:text-zinc-500">Sin notificaciones</p>
              </div>
            )}

            {items.map(item => {
              const style = TYPE_STYLES[item.type] ?? TYPE_STYLES.info
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={[
                    'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors',
                    item.is_read
                      ? 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                      : 'bg-[#F5F4FF] dark:bg-zinc-800 hover:bg-[#ECEAFB] dark:hover:bg-zinc-700/60',
                  ].join(' ')}
                >
                  {/* Type icon */}
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.bg}`}>
                    {style.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${item.is_read ? 'text-slate-600 dark:text-zinc-400' : 'text-slate-800 dark:text-zinc-100'}`}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500 line-clamp-2">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-zinc-600">
                      {timeAgo(item.created_at)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!item.is_read && (
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#7b6fe8] dark:bg-[#91EB78]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
