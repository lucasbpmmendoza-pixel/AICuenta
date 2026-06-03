import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface PlanRow {
  id: number;
  nombre: string;
  costo: number;
  duracion_meses: number;
  stripe_price_id: string;
  descripcion: string | null;
}

export async function GET() {
  try {
    const db = await getDb();
    const plansResult = await db.request().query<PlanRow>(`
      SELECT id, nombre, costo, duracion_meses, stripe_price_id, descripcion
      FROM plans
      WHERE es_activo = 1
      ORDER BY costo ASC
    `);

    return NextResponse.json({ plans: plansResult.recordset });
  } catch (err) {
    console.error("[billing/plans]", (err as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los planes" }, { status: 500 });
  }
}
