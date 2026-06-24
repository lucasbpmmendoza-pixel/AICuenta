import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface PlanRow {
  id: number;
  nombre: string;
  costo: number;
  duracion_meses: number;
  stripe_price_id: string | null;
  descripcion: string | null;
  cfdis_5_anios: number | null;
  requiere_contacto: boolean;
}

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query<PlanRow>(`
      SELECT id, nombre, costo, duracion_meses, stripe_price_id,
             descripcion, cfdis_5_anios, requiere_contacto
      FROM plans
      WHERE es_activo = 1
      ORDER BY requiere_contacto ASC, costo ASC
    `);

    const plans = result.recordset.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      costo: Number(p.costo),
      duracion_meses: p.duracion_meses,
      stripe_price_id: p.stripe_price_id,
      descripcion: p.descripcion,
      cfdis_5_anios: p.cfdis_5_anios,
      requiere_contacto: Boolean(p.requiere_contacto),
    }));

    return NextResponse.json({ plans });
  } catch (err) {
    console.error("[billing/plans]", (err as Error).message);
    return NextResponse.json(
      { error: "No se pudieron obtener los planes" },
      { status: 500 },
    );
  }
}
