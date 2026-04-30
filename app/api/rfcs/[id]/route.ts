import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

// PATCH /api/rfcs/[id] — toggle downloads_enabled
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role === "member") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();

    // Leer valor actual y verificar propiedad
    const current = await db
      .request()
      .input("id",      id)
      .input("user_id", effectiveUserId)
      .query<{ downloads_enabled: boolean }>(
        "SELECT downloads_enabled FROM EFIELES WHERE id = @id AND user_id = @user_id"
      );

    if (!current.recordset[0]) {
      return NextResponse.json({ error: "RFC no encontrado" }, { status: 404 });
    }

    const newValue = current.recordset[0].downloads_enabled ? 0 : 1;

    await db
      .request()
      .input("id",      id)
      .input("user_id", effectiveUserId)
      .input("val",     newValue)
      .query("UPDATE EFIELES SET downloads_enabled = @val WHERE id = @id AND user_id = @user_id");

    return NextResponse.json({ ok: true, downloads_enabled: newValue === 1 });
  } catch (err) {
    console.error("[rfcs PATCH] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 503 });
  }
}

// DELETE /api/rfcs/[id] — elimina el RFC y sus blobs
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role === "member") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  const effectiveUserId = session.ownerId ?? session.sub;

  const db = await getDb();

  // Verificar propiedad y obtener el RFC para borrar blobs
  const row = await db
    .request()
    .input("id",      id)
    .input("user_id", effectiveUserId)
    .query<{ rfc: string }>(
      "SELECT rfc FROM EFIELES WHERE id = @id AND user_id = @user_id"
    );

  if (!row.recordset[0]) {
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 404 });
  }

  const rfc = row.recordset[0].rfc;

  // Borrar registro de BD primero
  try {
    await db
      .request()
      .input("id",      id)
      .input("user_id", effectiveUserId)
      .query("DELETE FROM EFIELES WHERE id = @id AND user_id = @user_id");
  } catch (err) {
    console.error("[rfcs DELETE] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al eliminar el RFC" }, { status: 503 });
  }

  // Borrar blobs (best-effort, no bloquea)
  try {
    const prefix = `${rfc}/`;
    const { blobs } = await list({ prefix });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
  } catch (err) {
    console.error("[rfcs DELETE] Blob cleanup error:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
