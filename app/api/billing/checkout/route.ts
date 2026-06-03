import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";

interface UserRow {
  id: string;
  email: string;
  name: string;
}

interface PlanRow {
  id: number;
  stripe_price_id: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { planId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const planId = Number(body.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return NextResponse.json({ error: "planId invalido" }, { status: 422 });
  }

  try {
    const db = await getDb();

    const userResult = await db.request().input("id", session.sub).query<UserRow>(`
      SELECT id, email, name
      FROM users
      WHERE id = @id
    `);

    const user = userResult.recordset[0];
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const planResult = await db.request().input("id", planId).query<PlanRow>(`
      SELECT id, stripe_price_id
      FROM plans
      WHERE id = @id AND es_activo = 1
    `);

    const plan = planResult.recordset[0];
    if (!plan) {
      return NextResponse.json({ error: "Plan no disponible" }, { status: 404 });
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/dashboard?checkout=cancel`,
      metadata: {
        userId: user.id,
        planId: String(plan.id),
      },
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "No se pudo crear la sesion" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[billing/checkout]", (err as Error).message);
    return NextResponse.json({ error: "No se pudo iniciar checkout" }, { status: 500 });
  }
}
