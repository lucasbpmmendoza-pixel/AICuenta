import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();

    // Miembros solo ven los RFCs que el owner les asignó explícitamente en member_rfcs
    if (session.role === "member") {
      const result = await db
        .request()
        .input("memberId", session.sub)
        .query<{
          id: string;
          rfc: string;
          fiel: string;
          downloads_enabled: boolean;
          created_at: string;
          last_update: string;
        }>(
          `SELECT e.id, e.rfc, e.fiel, e.downloads_enabled, e.created_at, e.last_update
           FROM EFIELES e
           INNER JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
           ORDER BY e.created_at DESC`
        );
      return NextResponse.json({ rfcs: result.recordset });
    }

    const result = await db
      .request()
      .input("user_id", effectiveUserId)
      .query<{
        id: string;
        rfc: string;
        fiel: string;
        downloads_enabled: boolean;
        created_at: string;
        last_update: string;
      }>(
        `SELECT id, rfc, fiel, downloads_enabled, created_at, last_update
         FROM EFIELES
         WHERE user_id = @user_id
         ORDER BY created_at DESC`
      );
    return NextResponse.json({ rfcs: result.recordset });
  } catch (err) {
    console.error("[rfcs GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener los RFCs" }, { status: 503 });
  }
}
