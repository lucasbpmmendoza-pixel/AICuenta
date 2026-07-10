import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  currentPeriod,
  findAvailableCuadroDownload,
  hasComparAudUnlock,
  isOneTimeTipo,
} from "@/lib/one-time-purchases";

export const runtime = "nodejs";

/**
 * GET /api/billing/one-time?tipo=cuadro_download
 *   -> { available: boolean, purchaseId?: number }
 *
 * GET /api/billing/one-time?tipo=comparar_auditar_mes&year=YYYY&month=MM
 *   -> { available: boolean, year, month }
 *   (year/month opcionales; por default el mes calendario actual)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.isDemo) {
    return NextResponse.json({ available: false });
  }

  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!isOneTimeTipo(tipo)) {
    return NextResponse.json({ error: "tipo invalido" }, { status: 422 });
  }

  try {
    const db = await getDb();

    if (tipo === "cuadro_download") {
      const purchaseId = await findAvailableCuadroDownload(db, session.sub);
      return NextResponse.json({
        available: purchaseId !== null,
        purchaseId: purchaseId ?? undefined,
      });
    }

    // comparar_auditar_mes: si el cliente no manda periodo, usamos el actual.
    const yParam = Number(req.nextUrl.searchParams.get("year"));
    const mParam = Number(req.nextUrl.searchParams.get("month"));
    const cur = currentPeriod();
    const y = Number.isInteger(yParam) && yParam > 0 ? yParam : cur.year;
    const m = Number.isInteger(mParam) && mParam >= 1 && mParam <= 12 ? mParam : cur.month;

    const available = await hasComparAudUnlock(db, session.sub, y, m);
    return NextResponse.json({ available, year: y, month: m });
  } catch (err) {
    console.error("[billing/one-time][GET]", (err as Error).message);
    return NextResponse.json({ available: false });
  }
}
