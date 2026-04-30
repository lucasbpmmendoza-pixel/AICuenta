import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();
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
