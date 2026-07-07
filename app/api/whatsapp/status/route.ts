/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status for the authenticated owner.
 */
import { getSession } from '@/lib/session'
import { getStatus } from '@/lib/whatsapp-manager'
import {
  getWhatsappWorkerHeaders,
  getWhatsappWorkerUrl,
  isWhatsappWorkerEnabled,
} from '@/lib/whatsapp-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (session.isDemo) {
    // En demo siempre reportamos desconectado para que la UI muestre el CTA de registro.
    return Response.json({ status: 'disconnected', qrDataUrl: null })
  }

  const ownerId = session.ownerId ?? session.sub

  if (isWhatsappWorkerEnabled()) {
    const upstream = await fetch(getWhatsappWorkerUrl('/status', ownerId), {
      method: 'GET',
      headers: getWhatsappWorkerHeaders(),
      cache: 'no-store',
    })

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => 'Worker request failed')
      return new Response(body || 'Worker request failed', {
        status: upstream.status || 502,
      })
    }

    const json = await upstream.json().catch(() => ({ status: 'disconnected', qrDataUrl: null }))
    return Response.json(json)
  }

  const { status, qrDataUrl } = getStatus(ownerId)

  return Response.json({ status, qrDataUrl })
}
