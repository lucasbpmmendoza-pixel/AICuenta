import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ── PATCH /api/notifications/[id] ─────────────────────────────────────────
// Marca una notificación específica como leída
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ ok: true });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!isGuid(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (!isGuid(session.sub)) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

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
