/**
 * GET /api/comprobantes
 * Returns paginated list of comprobantes for the authenticated owner.
 * Query params: page (default 1), limit (default 50)
 */
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ownerId = session.ownerId ?? session.sub
  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const offset = (page - 1) * limit

  try {
    const db = await getDb()

    const countResult = await db.request()
      .input('owner_id', ownerId)
      .query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM dbo.Comprobantes WHERE owner_id = @owner_id',
      )
    const total = countResult.recordset[0]?.total ?? 0

    const rows = await db.request()
      .input('owner_id', ownerId)
      .input('limit',    limit)
      .input('offset',   offset)
      .query(`
        SELECT
          id, remitente_nombre, remitente_telefono, banco, fecha, monto,
          folio, concepto, referencia, clave_rastreo, beneficiario, cuenta_destino,
          Fuente AS fuente, created_at
        FROM dbo.Comprobantes
        WHERE owner_id = @owner_id
        ORDER BY created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `)

    return Response.json({ total, page, limit, rows: rows.recordset })
  } catch (err) {
    console.error('[comprobantes] Error:', (err as Error).message)
    return Response.json({ error: 'Error al obtener comprobantes' }, { status: 500 })
  }
}
