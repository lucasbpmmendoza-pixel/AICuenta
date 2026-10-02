import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { shareRfcWithTeam, unshareRfcWithTeam } from "@/lib/team-share";

// POST   /api/rfcs/[id]/team — da acceso al RFC a todos los miembros del equipo
// DELETE /api/rfcs/[id]/team — quita el acceso al RFC a todos los miembros
async function handle(method: "POST" | "DELETE", params: Promise<{ id: string }>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role === "member") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();

    // Verificar propiedad
    const owned = await db
      .request()
      .input("id",      id)
      .input("user_id", effectiveUserId)
      .query("SELECT id FROM EFIELES WHERE id = @id AND user_id = @user_id");

    if (!owned.recordset[0]) {
      return NextResponse.json({ error: "RFC no encontrado" }, { status: 404 });
    }

    if (method === "POST") await shareRfcWithTeam(db, effectiveUserId, id);
    else                   await unshareRfcWithTeam(db, effectiveUserId, id);

    const counts = await db
      .request()
      .input("id",      id)
      .input("ownerId", effectiveUserId)
      .query<{ team_total: number; team_shared: number }>(`
        SELECT COUNT(*) AS team_total,
               SUM(CASE WHEN mr.efiel_id IS NOT NULL THEN 1 ELSE 0 END) AS team_shared
        FROM   users u
        LEFT JOIN member_rfcs mr ON mr.member_id = u.id AND mr.efiel_id = @id
        WHERE  u.owner_id = @ownerId AND u.role = 'member'
      `);

    return NextResponse.json({
      ok: true,
      team_total:  counts.recordset[0]?.team_total ?? 0,
      team_shared: counts.recordset[0]?.team_shared ?? 0,
    });
  } catch (err) {
    console.error(`[rfcs team ${method}] DB error:`, (err as Error).message);
    return NextResponse.json({ error: "Error al actualizar el acceso del equipo" }, { status: 503 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("POST", params);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("DELETE", params);
}
