import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (await isFreemiumOwner(session)) {
    return NextResponse.json({ error: FREEMIUM_FORBIDDEN_MESSAGE }, { status: 403 });
  }

  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("user_id", session.sub)
      .query<{ rfc: string; auth_code: string }>(
        "SELECT TOP 1 rfc, auth_code FROM EFIELES WHERE user_id = @user_id ORDER BY created_at DESC"
      );

    if (!result.recordset[0]) {
      return NextResponse.json({ error: "Sin RFC registrado" }, { status: 404 });
    }

    return NextResponse.json(result.recordset[0]);
  } catch (err) {
    console.error("[unete/token]", (err as Error).message);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
