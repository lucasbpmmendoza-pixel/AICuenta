// Rate limit client-side para las descargas de "Crea tus cuadros" (Facturas en
// modo XML). El Excel plano y el "cuadro AIcuenta" clasificado se generan en el
// navegador sin tocar el servidor, asi que el limite server-side de demo
// (lib/demo-download-limit.ts) no aplica: guardamos los timestamps de las
// descargas en localStorage y limitamos cuantas puede hacer el usuario dentro
// de una ventana movil.
//
// Se aplica solo a demo y freemium — los usuarios de pago no tienen limite.
// El bucket es COMPARTIDO entre los dos botones (plano + clasificado), asi que
// gastar 15 en uno agota tambien el otro.

export const DOWNLOAD_LIMIT = 15
export const DOWNLOAD_WINDOW_MINUTES = 30

const WINDOW_MS = DOWNLOAD_WINDOW_MINUTES * 60 * 1000
const STORAGE_KEY = 'aicuenta_download_window'

export interface DownloadLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

function readTimestamps(now: number): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return raw
      .split(',')
      .map(Number)
      .filter(ts => Number.isFinite(ts) && ts > 0 && now - ts < WINDOW_MS)
      .sort((a, b) => a - b)
  } catch {
    return []
  }
}

function writeTimestamps(timestamps: number[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, timestamps.join(','))
  } catch {
    // localStorage lleno o modo privado — se pierde el limite pero no se rompe la UI.
  }
}

/**
 * Consume un slot de descarga. Si el limite ya se alcanzo, devuelve
 * `allowed: false` y no consume el slot; devuelve `retryAfterSeconds` para
 * mostrarle al usuario cuanto tiene que esperar.
 */
export function consumeDownloadSlot(): DownloadLimitResult {
  const now = Date.now()
  const timestamps = readTimestamps(now)

  if (timestamps.length >= DOWNLOAD_LIMIT) {
    const oldest = timestamps[0] ?? now
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000))
    writeTimestamps(timestamps) // reescribimos por si el filtrado quito timestamps expirados
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  timestamps.push(now)
  writeTimestamps(timestamps)
  return {
    allowed: true,
    remaining: Math.max(DOWNLOAD_LIMIT - timestamps.length, 0),
    retryAfterSeconds: 0,
  }
}

/** Formato amigable para el mensaje "intenta en X" — "1m 20s" / "45s". */
export function formatRetryAfter(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  if (minutes <= 0) return `${remainingSeconds}s`
  return `${minutes}m ${remainingSeconds}s`
}
