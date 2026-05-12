import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchEfectivamentePagado } from "@/lib/facturas-query";

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db
    .request()
    .input("uid", userId)
    .input("rfc", rfc)
    .query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc"
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc   = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc))) {
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });
  }

  const dateFrom = new Date(year, month - 1, 1);
  const dateTo   = new Date(year, month, 1);

  try {
    const rows = await fetchEfectivamentePagado(rfc, dateFrom, dateTo, 10);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[efectivamente-pagado/data]", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 503 });
  }
}
