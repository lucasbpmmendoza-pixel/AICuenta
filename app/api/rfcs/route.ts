import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { rfcAlias } from "@/lib/rfc-aliases";
import { getDemoRfcs } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ rfcs: getDemoRfcs() });
  }

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
          alias: string | null;
          fiel: string;
          downloads_enabled: boolean;
          created_at: string;
          last_update: string;
        }>(
          `SELECT e.id, e.rfc, alias, e.fiel, e.downloads_enabled, e.created_at, e.last_update
           FROM EFIELES e
           INNER JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
           ORDER BY e.created_at DESC`
        );
      return NextResponse.json({
        rfcs: result.recordset.map(r => ({
          ...r,
          alias: rfcAlias(r.rfc) ?? r.alias,
        })),
      });
    }

    const result = await db
      .request()
      .input("user_id", effectiveUserId)
      .query<{
        id: string;
        rfc: string;
        alias: string | null;
        fiel: string;
        downloads_enabled: boolean;
        created_at: string;
        last_update: string;
      }>(
        `SELECT id, rfc, alias, fiel, downloads_enabled, created_at, last_update
         FROM EFIELES
         WHERE user_id = @user_id
         ORDER BY created_at DESC`
      );
    return NextResponse.json({
      rfcs: result.recordset.map(r => ({
        ...r,
        alias: rfcAlias(r.rfc) ?? r.alias,
      })),
    });
  } catch (err) {
    console.error("[rfcs GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener los RFCs" }, { status: 503 });
  }
}
