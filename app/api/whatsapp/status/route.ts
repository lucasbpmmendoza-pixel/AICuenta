/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status for the authenticated owner.
 */
import { getSession } from '@/lib/session'
import { getStatus } from '@/lib/whatsapp-manager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ownerId = session.ownerId ?? session.sub
  const { status, qrDataUrl } = getStatus(ownerId)

  return Response.json({ status, qrDataUrl })
}
