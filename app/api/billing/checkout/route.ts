import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";

interface UserRow {
  stripe_customer_id: string | null;
  trial_elegible: boolean;
}

interface PlanRow {
  id: number;
  stripe_price_id: string | null;
  requiere_contacto: boolean;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.isDemo) {
    return NextResponse.json(
      { error: "El checkout no esta disponible en modo demo" },
      { status: 403 },
    );
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

    // 1. Plan
    const planResult = await db.request().input("id", planId).query<PlanRow>(`
      SELECT id, stripe_price_id, requiere_contacto
      FROM plans
      WHERE id = @id AND es_activo = 1
    `);
    const plan = planResult.recordset[0];
    if (!plan) {
      return NextResponse.json(
        { error: `Plan ${planId} no disponible` },
        { status: 404 },
      );
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

    // 2. Usuario (de la sesion JWT obtenemos id/email/name)
    const userResult = await db.request().input("id", session.sub).query<UserRow>(`
      SELECT stripe_customer_id, trial_elegible
      FROM users
      WHERE id = @id
    `);
    const userRow = userResult.recordset[0];
    if (!userRow) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    const stripe = getStripe();

    // 3. Reutiliza el customer de Stripe o crea uno y lo guarda en users
    let customerId = userRow.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.email,
        name: session.name,
        metadata: { userId: session.sub },
      });
      customerId = customer.id;
      await db
        .request()
        .input("id", session.sub)
        .input("cust", customerId)
        .query(`UPDATE users SET stripe_customer_id = @cust WHERE id = @id`);
    }

    // 4. Clientes antiguos (trial_elegible) obtienen 30 dias de prueba
    const trialDays = userRow.trial_elegible ? 30 : 0;
    const baseUrl = getAppBaseUrl();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data:
        trialDays > 0 ? { trial_period_days: trialDays } : undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/dashboard?checkout=cancel`,
      metadata: {
        userId: session.sub,
        planId: String(plan.id),
      },
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "No se pudo crear la sesión" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[billing/checkout]", (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo iniciar checkout" },
      { status: 500 },
    );
  }
}
