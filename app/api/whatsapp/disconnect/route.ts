/**
 * POST /api/whatsapp/disconnect
 * Disconnects the WhatsApp session and clears saved credentials.
 */
import { getSession } from '@/lib/session'
import { disconnectSession } from '@/lib/whatsapp-manager'
import {
  getWhatsappWorkerHeaders,
  getWhatsappWorkerUrl,
  isWhatsappWorkerEnabled,
} from '@/lib/whatsapp-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (session.isDemo) {
    return Response.json(
      { error: 'En modo demo no puedes gestionar WhatsApp. Crea una cuenta para usar Scan Bot.' },
      { status: 403 },
    )
  }

  const ownerId = session.ownerId ?? session.sub

  if (isWhatsappWorkerEnabled()) {
    const upstream = await fetch(getWhatsappWorkerUrl('/disconnect', ownerId), {
      method: 'POST',
      headers: getWhatsappWorkerHeaders(),
      cache: 'no-store',
    })

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => 'Worker request failed')
      return new Response(body || 'Worker request failed', {
        status: upstream.status || 502,
      })
    }

    return Response.json({ ok: true })
  }

  await disconnectSession(ownerId)

  return Response.json({ ok: true })
}
