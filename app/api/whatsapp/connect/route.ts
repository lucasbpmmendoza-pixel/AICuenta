/**
 * GET /api/whatsapp/connect
 * SSE stream — emits QR data URLs and connection status changes.
 * Also starts the Baileys session if not already running.
 */
import { getSession } from '@/lib/session'
import { startSession, subscribe, getStatus } from '@/lib/whatsapp-manager'
import {
  getWhatsappWorkerStreamHeaders,
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
    return Response.json(
      { error: 'En modo demo no puedes conectar WhatsApp. Crea una cuenta para usar Scan Bot.' },
      { status: 403 },
    )
  }

  // Owner key: owners use their own ID, members use their owner's ID
  const ownerId = session.ownerId ?? session.sub

  if (isWhatsappWorkerEnabled()) {
    const upstream = await fetch(getWhatsappWorkerUrl('/connect', ownerId), {
      method: 'GET',
      headers: getWhatsappWorkerStreamHeaders(),
      cache: 'no-store',
    })

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text().catch(() => 'Worker request failed')
      return new Response(body || 'Worker request failed', {
        status: upstream.status || 502,
      })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  // Kick off the session (no-op if already running)
  startSession(ownerId).catch(console.error)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send current state immediately so the client doesn't wait
      const current = getStatus(ownerId)
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      sendEvent({ type: 'status', status: current.status })
      if (current.qrDataUrl) {
        sendEvent({ type: 'qr', dataUrl: current.qrDataUrl })
      }

      // Subscribe to future events
      const unsub = subscribe(ownerId, (event) => {
        try {
          sendEvent(event)
          // Close the SSE stream once connected — client re-polls status
          if (event.type === 'status' && event.status === 'connected') {
            controller.close()
            unsub()
          }
        } catch {
          // Stream may already be closed
          unsub()
        }
      })

      // Keep the stream alive with a heartbeat every 25 s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(heartbeat)
          unsub()
        }
      }, 25_000)

      // Cleanup handled by the cancel callback below
      ;(controller as unknown as { _cleanup?: () => void })._cleanup = () => {
        clearInterval(heartbeat)
        unsub()
      }
    },
    cancel(controller) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(controller as any)._cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
