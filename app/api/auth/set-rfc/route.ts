import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'

const RFC_SAFE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/i

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rfc } = await req.json()
  if (!rfc || !RFC_SAFE.test(rfc)) {
    return NextResponse.json({ error: 'RFC inválido' }, { status: 400 })
  }

  try {
    const effectiveId = session.ownerId ?? session.sub
    const db = await getDb()
    await db
      .request()
      .input('id', effectiveId)
      .input('rfc', (rfc as string).trim().toUpperCase())
      .query('UPDATE users SET rfc = @rfc WHERE id = @id')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[set-rfc]', (err as Error).message)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
