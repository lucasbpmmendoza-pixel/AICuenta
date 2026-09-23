import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// mssql requiere el runtime de Node (no Edge)
export const runtime = "nodejs";

interface PlanRow {
  id: number;
  stripe_price_id: string | null;
  requiere_contacto: boolean;
}

interface MembRow {
  id: number;
  plan_id: number;
  stripe_subscription_id: string;
}

// POST /api/billing/change-plan  { planId }
// Mejora/cambia el plan del usuario CAMBIANDO EL PRECIO de su suscripcion
// existente en Stripe (no crea otra suscripcion => no hay cobro doble). El
// prorrateo lo maneja Stripe. Si el usuario no tiene suscripcion activa,
// responde 409 para que la UI use el checkout normal (comprar).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.isDemo) {
    return NextResponse.json({ error: "No disponible en modo demo" }, { status: 403 });
  }

  let body: { planId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const planId = Number(body.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return NextResponse.json({ error: "planId inválido" }, { status: 422 });
  }

  try {
    const db = await getDb();

    // 1. Plan destino
    const planRes = await db.request().input("id", planId).query<PlanRow>(`
      SELECT id, stripe_price_id, requiere_contacto
      FROM plans
      WHERE id = @id AND es_activo = 1
    `);
    const plan = planRes.recordset[0];
    if (!plan) {
      return NextResponse.json({ error: `Plan ${planId} no disponible` }, { status: 404 });
    }
    if (plan.requiere_contacto) {
      return NextResponse.json(
        { error: "Este plan es personalizado, contacta a ventas" },
        { status: 400 },
      );
    }
    if (!plan.stripe_price_id) {
      return NextResponse.json(
        { error: "Plan sin precio configurado en Stripe" },
        { status: 500 },
      );
    }

    // 2. Suscripcion activa del usuario
    const membRes = await db.request().input("uid", session.sub).query<MembRow>(`
      SELECT TOP 1 id, plan_id, stripe_subscription_id
      FROM membresias
      WHERE user_id = @uid
        AND estado NOT IN ('cancelada', 'expirada')
        AND stripe_subscription_id IS NOT NULL
      ORDER BY fecha_creacion DESC
    `);
    const memb = membRes.recordset[0];
    if (!memb) {
      // Sin plan: que compre por el checkout normal.
      return NextResponse.json(
        { error: "No tienes una suscripción activa", code: "no_subscription" },
        { status: 409 },
      );
    }
    if (memb.plan_id === plan.id) {
      return NextResponse.json(
        { error: "Ya estás en ese plan", code: "same_plan" },
        { status: 409 },
      );
    }

    // 3. Cambiar el precio del item EXISTENTE (no crea otra suscripcion)
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(memb.stripe_subscription_id);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json(
        { error: "La suscripción no tiene un precio para actualizar" },
        { status: 500 },
      );
    }

    await stripe.subscriptions.update(memb.stripe_subscription_id, {
      items: [{ id: itemId, price: plan.stripe_price_id }],
      proration_behavior: "create_prorations",
    });

    // 4. Refleja el plan nuevo en BD de una vez (el webhook updated tambien lo
    //    sincroniza, pero lo dejamos consistente sin esperar la reentrega).
    await db
      .request()
      .input("mid", memb.id)
      .input("plan", plan.id)
      .query(`UPDATE membresias SET plan_id = @plan, fecha_actualizacion = GETDATE() WHERE id = @mid`);

    return NextResponse.json({ ok: true, planId: plan.id });
  } catch (err) {
    console.error("[billing/change-plan]", (err as Error).message);
    return NextResponse.json({ error: "No se pudo cambiar de plan" }, { status: 500 });
  }
}
