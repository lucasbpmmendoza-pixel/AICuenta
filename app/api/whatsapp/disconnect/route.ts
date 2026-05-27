/**
 * POST /api/whatsapp/disconnect
 * Disconnects the WhatsApp session and clears saved credentials.
 */
import { getSession } from '@/lib/session'
import { disconnectSession } from '@/lib/whatsapp-manager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ownerId = session.ownerId ?? session.sub
  await disconnectSession(ownerId)

  return Response.json({ ok: true })
}
