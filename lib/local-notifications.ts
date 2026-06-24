// Notificaciones locales (en localStorage), independientes de la base de datos.
//
// Se usan, por ejemplo, para avisar que una IA (FinDoc / FiscalGPT) terminó de
// responder mientras el usuario navegaba en otra página. Como viven en el
// navegador, funcionan aunque la base de datos esté caída.

export interface LocalNotification {
  id: string
  title: string
  body: string | null
  type: 'info' | 'success' | 'warning' | 'error'
  link: string | null
  is_read: boolean
  created_at: string
}

const KEY = 'aicuenta_local_notifications'
const MAX = 30

// Evento de ventana para que el timbre se entere al instante (mismo tab) de que
// hubo un cambio, sin esperar al sondeo periódico.
export const LOCAL_NOTIFICATIONS_EVENT = 'aicuenta:notifications'

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(LOCAL_NOTIFICATIONS_EVENT))
  } catch {}
}

const EMPTY: LocalNotification[] = []

function parse(raw: string | null): LocalNotification[] {
  if (!raw) return EMPTY
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    return parsed.filter(
      (n): n is LocalNotification =>
        !!n && typeof n.id === 'string' && typeof n.title === 'string',
    )
  } catch {
    return EMPTY
  }
}

export function loadLocalNotifications(): LocalNotification[] {
  if (typeof window === 'undefined') return EMPTY
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return EMPTY
  }
}

// ─── Soporte para useSyncExternalStore (lectura reactiva sin efectos) ──────────
let snapshotCache: LocalNotification[] = EMPTY
let snapshotRaw: string | null = null

// Devuelve una referencia ESTABLE mientras el contenido no cambie (requisito de
// useSyncExternalStore: solo re-renderiza si la referencia es distinta).
export function getLocalNotificationsSnapshot(): LocalNotification[] {
  if (typeof window === 'undefined') return EMPTY
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    raw = null
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw
    snapshotCache = parse(raw)
  }
  return snapshotCache
}

export function getLocalNotificationsServerSnapshot(): LocalNotification[] {
  return EMPTY
}

export function subscribeLocalNotifications(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(LOCAL_NOTIFICATIONS_EVENT, cb)
  window.addEventListener('storage', cb) // cambios desde otra pestaña
  return () => {
    window.removeEventListener(LOCAL_NOTIFICATIONS_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

function save(items: LocalNotification[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
  } catch {}
}

export function pushLocalNotification(input: {
  title: string
  body?: string | null
  type?: LocalNotification['type']
  link?: string | null
  id?: string
}): void {
  if (typeof window === 'undefined') return
  const notif: LocalNotification = {
    id: input.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    body: input.body ?? null,
    type: input.type ?? 'success',
    link: input.link ?? null,
    is_read: false,
    created_at: new Date().toISOString(),
  }
  save([notif, ...loadLocalNotifications()])
  emitChange()
}

export function markLocalRead(id: string): void {
  save(loadLocalNotifications().map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  emitChange()
}

export function markAllLocalRead(): void {
  save(loadLocalNotifications().map((n) => ({ ...n, is_read: true })))
  emitChange()
}

export function clearLocalNotifications(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {}
  emitChange()
}

// Identifica una notificación local (vs. una de la base de datos) por su id.
export function isLocalNotificationId(id: string): boolean {
  return id.startsWith('local-')
}
