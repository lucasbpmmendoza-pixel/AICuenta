// Recordatorios mensuales por calendario (día 5 auditoria, 16 pago, 25 cierre).
//
// Se calculan en el cliente a partir de la fecha actual — no viven ni en la base
// de datos ni en `local-notifications` (que se usa para avisos de las IAs).
// El estado "leída" se persiste en localStorage por id, para que al marcarlas
// no vuelvan a mostrarse como no leídas.

export interface CalendarNotification {
  id: string
  title: string
  body: string | null
  type: 'info' | 'success' | 'warning' | 'error'
  link: string | null
  is_read: boolean
  created_at: string
}

// ── MODO TEST ─────────────────────────────────────────────────────────────────
// Cuando está en true, las tres notificaciones se muestran hoy sin importar el
// día del mes. Poner en false para que cada una salga solo en su día real.
const TEST_MODE_ALL_TODAY = true

type ReminderDef = {
  day: number
  key: string
  title: string
  body: string
  type: CalendarNotification['type']
}

const REMINDERS: ReminderDef[] = [
  {
    day: 5,
    key: 'auditoria-impuestos',
    title: 'Auditoría de impuestos',
    body: 'Hoy es día de auditoría de impuestos.',
    type: 'warning',
  },
  {
    day: 16,
    key: 'pago-impuestos',
    title: 'Pago de impuestos',
    body: 'Hoy vence el pago de impuestos.',
    type: 'warning',
  },
  {
    day: 25,
    key: 'cierre-mes',
    title: 'Cierre de mes',
    body: 'Hoy es el cierre de mes.',
    type: 'info',
  },
]

const READ_KEY = 'aicuenta_calendar_notifications_read'

export const CALENDAR_NOTIFICATIONS_EVENT = 'aicuenta:calendar-notifications'

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(CALENDAR_NOTIFICATIONS_EVENT))
  } catch {}
}

function loadReadSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveReadSet(set: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...set]))
  } catch {}
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function computeItems(now: Date): CalendarNotification[] {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed
  const today = now.getDate()
  const yyyymm = `${y}-${pad2(m + 1)}`
  const activeDefs = TEST_MODE_ALL_TODAY
    ? REMINDERS
    : REMINDERS.filter((r) => r.day === today)

  const readSet = loadReadSet()

  return activeDefs.map((def) => {
    // En modo test la fecha visible es hoy; fuera de modo test, el día del recordatorio.
    const day = TEST_MODE_ALL_TODAY ? today : def.day
    const createdAt = new Date(y, m, day, 9, 0, 0)
    const id = `cal-${yyyymm}-${pad2(def.day)}-${def.key}`
    return {
      id,
      title: def.title,
      body: def.body,
      type: def.type,
      link: null,
      is_read: readSet.has(id),
      created_at: createdAt.toISOString(),
    }
  })
}

// ── Snapshot estable para useSyncExternalStore ────────────────────────────────
const EMPTY: CalendarNotification[] = []
let snapshotCache: CalendarNotification[] = EMPTY
let snapshotSig = ''

function sigOf(items: CalendarNotification[]): string {
  return items.map((i) => `${i.id}:${i.is_read ? 1 : 0}`).join('|')
}

export function getCalendarNotificationsSnapshot(): CalendarNotification[] {
  if (typeof window === 'undefined') return EMPTY
  const items = computeItems(new Date())
  const sig = sigOf(items)
  if (sig !== snapshotSig) {
    snapshotSig = sig
    snapshotCache = items
  }
  return snapshotCache
}

export function getCalendarNotificationsServerSnapshot(): CalendarNotification[] {
  return EMPTY
}

export function subscribeCalendarNotifications(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CALENDAR_NOTIFICATIONS_EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(CALENDAR_NOTIFICATIONS_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function isCalendarNotificationId(id: string): boolean {
  return id.startsWith('cal-')
}

export function markCalendarRead(id: string): void {
  const set = loadReadSet()
  if (set.has(id)) return
  set.add(id)
  saveReadSet(set)
  emitChange()
}

export function markAllCalendarRead(): void {
  const items = computeItems(new Date())
  const set = loadReadSet()
  let changed = false
  for (const it of items) {
    if (!set.has(it.id)) {
      set.add(it.id)
      changed = true
    }
  }
  if (changed) {
    saveReadSet(set)
    emitChange()
  }
}
