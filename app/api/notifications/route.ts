import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";

export interface NotificationItem {
  id:         string;
  title:      string;
  body:       string | null;
  type:       "info" | "warning" | "success" | "error";
  link:       string | null;
  is_read:    boolean;
  created_at: string;
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ── GET /api/notifications ─────────────────────────────────────────────────
// Devuelve las 30 notificaciones más recientes del usuario + conteo de no leídas
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ items: [], unreadCount: 0 });
  }

  const userId = session.sub;
  if (!isGuid(userId)) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const db = await getDb();

  const [itemsRes, countRes] = await Promise.all([
    db.request()
      .input("uid", sql.UniqueIdentifier, userId)
      .query<NotificationItem>(`
        SELECT TOP 30
          CAST(id AS NVARCHAR(36)) AS id,
          title,
          body,
          type,
          link,
          CAST(is_read AS BIT) AS is_read,
          CONVERT(NVARCHAR(30), created_at, 127) AS created_at
        FROM notifications WITH (NOLOCK)
        WHERE user_id = @uid
        ORDER BY created_at DESC
      `),
    db.request()
      .input("uid", sql.UniqueIdentifier, userId)
      .query<{ cnt: number }>(`
        SELECT COUNT(*) AS cnt
        FROM notifications WITH (NOLOCK)
        WHERE user_id = @uid AND is_read = 0
      `),
  ]);

  return NextResponse.json({
    items:       itemsRes.recordset,
    unreadCount: countRes.recordset[0]?.cnt ?? 0,
  });
}

// ── PATCH /api/notifications ───────────────────────────────────────────────
// Body: { action: "read-all" }  → marca todas las notificaciones del usuario como leídas
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ ok: true });
  }

  if (!isGuid(session.sub)) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "read-all")
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const db = await getDb();
  await db.request()
    .input("uid", sql.UniqueIdentifier, session.sub)
    .query(`UPDATE notifications SET is_read = 1 WHERE user_id = @uid AND is_read = 0`);

  return NextResponse.json({ ok: true });
}
