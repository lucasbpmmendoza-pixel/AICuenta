import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

// DELETE /api/team/[id] — El owner elimina uno de sus miembros
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role && session.role !== "owner") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const db = await getDb();
    // Solo permite borrar miembros que pertenezcan a este owner
    const result = await db
      .request()
      .input("id",      id)
      .input("ownerId", session.sub)
      .query("DELETE FROM users WHERE id = @id AND owner_id = @ownerId AND role = 'member'");

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team DELETE] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al eliminar el usuario" }, { status: 503 });
  }
}
