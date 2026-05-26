import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { button } = await req.json()
    if (!button) return NextResponse.json({ error: 'Missing button' }, { status: 400 })

    // Validar que el nombre del botón sea conocido
    const validButtons = [
      'btn_descargar_excel_facturas',
      'btn_descargar_pagos_facturas',
      'btn_descargar_flujo_facturas',
      'btn_descargar_notas_facturas',
      'btn_descargar_estados_financieros',
      'tab_rfc',
      'tab_usuarios',
      'tab_dashboard',
      'tab_asistente_ia',
      'tab_asistente_docs',
      'tab_aichikenelo',
    ]

    if (!validButtons.includes(button)) {
      return NextResponse.json({ error: 'Invalid button' }, { status: 400 })
    }

    const db = await getDb()

    // Verificar si existe registro para este usuario
    const existing = await db
      .request()
      .input('user_id', session.sub)
      .query<{ id: number }>(
        `SELECT id FROM logs WHERE user_id = @user_id`
      )

    if (existing.recordset.length > 0) {
      // UPDATE: incrementar el contador
      await db
        .request()
        .input('user_id', session.sub)
        .query(
          `UPDATE logs SET ${button} = ${button} + 1, lastupdate = GETDATE() WHERE user_id = @user_id`
        )
    } else {
      // INSERT: crear nuevo registro
      await db
        .request()
        .input('user_id', session.sub)
        .query(
          `INSERT INTO logs (user_id, ${button}) VALUES (@user_id, 1)`
        )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error logging action:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
