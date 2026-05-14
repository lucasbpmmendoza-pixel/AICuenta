import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { fetchNotasCreditoData } from "@/lib/facturas-query";

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
  const rfc      = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year     = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP   = searchParams.get("month");
  const quarterP = searchParams.get("quarter");

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });
  if (isNaN(year)) return NextResponse.json({ error: "year inválido" }, { status: 400 });

  let dateFrom: Date;
  let dateTo: Date;

  if (quarterP !== null) {
    const q = parseInt(quarterP, 10);
    if (isNaN(q) || q < 1 || q > 4) return NextResponse.json({ error: "quarter inválido" }, { status: 400 });
    dateFrom = new Date(year, (q - 1) * 3, 1);
    dateTo   = new Date(year, q * 3, 1);
  } else if (monthP !== null) {
    const month = parseInt(monthP, 10);
    if (isNaN(month) || month < 1 || month > 12) return NextResponse.json({ error: "month inválido" }, { status: 400 });
    dateFrom = new Date(year, month - 1, 1);
    dateTo   = new Date(year, month, 1);
  } else {
    dateFrom = new Date(year, 0, 1);
    dateTo   = new Date(year + 1, 0, 1);
  }

  const effectiveUserId = session.ownerId ?? session.sub;
  if (!(await validateRfc(effectiveUserId, rfc))) {
    return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });
  }

  try {
    const notas = await fetchNotasCreditoData(rfc, dateFrom, dateTo, 10);
    return NextResponse.json({ notas });
  } catch (err) {
    console.error("[notas-credito/data]", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener notas de crédito" }, { status: 503 });
  }
}
