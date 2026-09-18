import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

// GET /api/billing/membership
// Devuelve la suscripcion vigente del usuario (para que la vista de Suscripcion
// sepa si debe ofrecer "Comprar" o "Mejorar/Cambiar de plan").
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.isDemo) return NextResponse.json({ active: false, planId: null, estado: null });

  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("uid", session.sub)
      .query<{ plan_id: number; estado: string; stripe_subscription_id: string | null }>(`
        SELECT TOP 1 plan_id, estado, stripe_subscription_id
        FROM membresias
        WHERE user_id = @uid
          AND estado NOT IN ('cancelada', 'expirada')
          AND stripe_subscription_id IS NOT NULL
        ORDER BY fecha_creacion DESC
      `);
    const row = result.recordset[0];
    return NextResponse.json({
      active: Boolean(row),
      planId: row?.plan_id ?? null,
      estado: row?.estado ?? null,
    });
  } catch (err) {
    console.error("[billing/membership]", (err as Error).message);
    // Fail-open: si no se puede leer, tratar como sin plan (ofrece comprar).
    return NextResponse.json({ active: false, planId: null, estado: null });
  }
}
