import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";

interface MembershipRow {
  stripe_customer_id: string | null;
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const membershipResult = await db.request().input("user_id", session.sub).query<MembershipRow>(`
      SELECT TOP 1 stripe_customer_id
      FROM membresias
      WHERE user_id = @user_id
        AND stripe_customer_id IS NOT NULL
      ORDER BY fecha_creacion DESC
    `);

    const membership = membershipResult.recordset[0];
    if (!membership?.stripe_customer_id) {
      return NextResponse.json({ error: "No existe cliente de Stripe asociado" }, { status: 404 });
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: membership.stripe_customer_id,
      return_url: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[billing/portal]", (err as Error).message);
    return NextResponse.json({ error: "No se pudo abrir el portal" }, { status: 500 });
  }
}
