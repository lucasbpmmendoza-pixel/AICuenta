import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  consumeCuadroDownload,
  findAvailableCuadroDownload,
} from "@/lib/one-time-purchases";

export const runtime = "nodejs";

/**
 * POST /api/billing/one-time/consume
 *   Body: { tipo: "cuadro_download" }
 *   -> { ok: true } si habia una descarga 'pagada' y quedo 'consumida'
 *   -> 402 si no habia
 *
 * (comparar_auditar_mes NO se consume: dura todo el mes; no expone endpoint.)
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.isDemo) {
    return NextResponse.json({ error: "No disponible en demo" }, { status: 403 });
  }

  let body: { tipo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  if (body.tipo !== "cuadro_download") {
    return NextResponse.json({ error: "tipo invalido" }, { status: 422 });
  }

  try {
    const db = await getDb();
    const purchaseId = await findAvailableCuadroDownload(db, session.sub);
    if (purchaseId === null) {
      return NextResponse.json(
        { error: "Sin descargas disponibles" },
        { status: 402 },
      );
    }
    const ok = await consumeCuadroDownload(db, session.sub, purchaseId);
    if (!ok) {
      // Carrera: otro tab ya la consumio entre el SELECT y el UPDATE.
      return NextResponse.json(
        { error: "Sin descargas disponibles" },
        { status: 402 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/one-time/consume]", (err as Error).message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
