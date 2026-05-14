import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

// ── PATCH /api/notifications/[id] ─────────────────────────────────────────
// Marca una notificación específica como leída
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = await getDb();
  await db.request()
    .input("id",  sql.UniqueIdentifier, id)
    .input("uid", sql.UniqueIdentifier, session.sub)
    .query(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = @id AND user_id = @uid
    `);

  return NextResponse.json({ ok: true });
}
