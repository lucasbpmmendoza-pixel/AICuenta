const WORKER_URL = process.env.WHATSAPP_WORKER_URL?.trim()
const WORKER_TOKEN = process.env.WHATSAPP_WORKER_TOKEN?.trim()

function getAuthHeader(): HeadersInit {
  if (!WORKER_TOKEN) return {}
  return { Authorization: `Bearer ${WORKER_TOKEN}` }
}

export function isWhatsappWorkerEnabled(): boolean {
  return Boolean(WORKER_URL)
}

export function getWhatsappWorkerUrl(pathname: string, ownerId: string): string {
  if (!WORKER_URL) {
    throw new Error('WHATSAPP_WORKER_URL is not configured')
  }

  const base = WORKER_URL.endsWith('/') ? WORKER_URL.slice(0, -1) : WORKER_URL
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = new URL(`${base}${path}`)
  url.searchParams.set('ownerId', ownerId)
  return url.toString()
}

export function getWhatsappWorkerHeaders(): HeadersInit {
  return {
    ...getAuthHeader(),
    'Content-Type': 'application/json',
  }
}

export function getWhatsappWorkerStreamHeaders(): HeadersInit {
  return {
    ...getAuthHeader(),
    Accept: 'text/event-stream',
  }
}
