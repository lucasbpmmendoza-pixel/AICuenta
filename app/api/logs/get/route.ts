import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = await getDb()

    const result = await db
      .request()
      .input('user_id', session.sub)
      .query(
        `SELECT * FROM logs WHERE user_id = @user_id`
      )

    if (result.recordset.length === 0) {
      return NextResponse.json({
        message: 'No logs found',
        data: null,
      })
    }

    return NextResponse.json({
      data: result.recordset[0],
    })
  } catch (err) {
    console.error('Error fetching logs:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
