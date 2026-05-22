import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { rfcAlias } from "@/lib/rfc-aliases";

// GET /api/team/[id]/rfcs — Todos los RFCs del owner con flag de asignacion al miembro
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role && session.role !== "owner") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id: memberId } = await params;

  try {
    const db = await getDb();

    const memberCheck = await db
      .request()
      .input("memberId", memberId)
      .input("ownerId", session.sub)
      .query("SELECT id FROM users WHERE id = @memberId AND owner_id = @ownerId AND role = 'member'");

    if (memberCheck.recordset.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const result = await db
      .request()
      .input("ownerId", session.sub)
      .input("memberId", memberId)
      .query<{ id: string; rfc: string; assigned: boolean }>(`
        SELECT e.id, e.rfc,
               CAST(CASE WHEN mr.efiel_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS assigned
        FROM   EFIELES e
        LEFT JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
        WHERE  e.user_id = @ownerId
        ORDER  BY e.rfc
      `);

    return NextResponse.json({
      rfcs: result.recordset.map(r => ({
        ...r,
        alias: rfcAlias(r.rfc) ?? null,
      })),
    });
  } catch (err) {
    console.error("[team rfcs GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener RFCs" }, { status: 503 });
  }
}

// PUT /api/team/[id]/rfcs — Reemplaza los RFCs asignados al miembro
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role && session.role !== "owner") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id: memberId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const { rfcIds } = body as { rfcIds: string[] };
  if (!Array.isArray(rfcIds)) {
    return NextResponse.json({ error: "rfcIds debe ser un arreglo" }, { status: 422 });
  }

  try {
    const db = await getDb();

    const memberCheck = await db
      .request()
      .input("memberId", memberId)
      .input("ownerId", session.sub)
      .query("SELECT id FROM users WHERE id = @memberId AND owner_id = @ownerId AND role = 'member'");

    if (memberCheck.recordset.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Verificar que todos los IDs pertenezcan a este owner
    if (rfcIds.length > 0) {
      const owned = await db
        .request()
        .input("ownerId", session.sub)
        .query<{ id: string }>(`SELECT id FROM EFIELES WHERE user_id = @ownerId`);
      const ownedSet = new Set(owned.recordset.map((r) => r.id));
      for (const rid of rfcIds) {
        if (!ownedSet.has(rid)) {
          return NextResponse.json({ error: "RFC no valido" }, { status: 403 });
        }
      }
    }

    // Reemplazar asignaciones
    await db
      .request()
      .input("memberId", memberId)
      .query("DELETE FROM member_rfcs WHERE member_id = @memberId");

    for (const rfcId of rfcIds) {
      await db
        .request()
        .input("memberId", memberId)
        .input("efielId", rfcId)
        .query("INSERT INTO member_rfcs (member_id, efiel_id) VALUES (@memberId, @efielId)");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team rfcs PUT] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al guardar RFCs" }, { status: 503 });
  }
}
