import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type StripeSubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

function toSqlDate(unixSeconds?: number | null): Date {
  return new Date((unixSeconds ?? 0) * 1000);
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "activa";
    case "canceled":
      return "cancelada";
    case "incomplete_expired":
    case "unpaid":
    case "past_due":
      return "suspendida";
    default:
      return "expirada";
  }
}

async function upsertMembershipFromSubscription(subscription: StripeSubscriptionWithPeriods): Promise<void> {
  const userId = subscription.metadata?.userId;
  const planIdRaw = subscription.metadata?.planId;

  if (!userId || !planIdRaw) {
    console.warn("[stripe/webhook] metadata incompleta en subscription", subscription.id);
    return;
  }

  const planId = Number(planIdRaw);
  if (!Number.isInteger(planId) || planId <= 0) {
    console.warn("[stripe/webhook] planId inválido en metadata", subscription.id);
    return;
  }

  const db = await getDb();

  const existsResult = await db.request().input("stripe_subscription_id", subscription.id).query<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt
    FROM membresias
    WHERE stripe_subscription_id = @stripe_subscription_id
  `);

  const isActive = (existsResult.recordset[0]?.cnt ?? 0) > 0;
  const estado = mapSubscriptionStatus(subscription.status);
  const fechaInicio = toSqlDate(subscription.current_period_start);
  const fechaExpiracion = toSqlDate(subscription.current_period_end);
  const fechaPago = new Date();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const renovacion = subscription.cancel_at_period_end ? 0 : 1;

  if (!isActive) {
    await db
      .request()
      .input("user_id", userId)
      .input("plan_id", planId)
      .input("stripe_subscription_id", subscription.id)
      .input("stripe_customer_id", customerId ?? null)
      .input("fecha_inicio", fechaInicio)
      .input("fecha_expiracion", fechaExpiracion)
      .input("estado", estado)
      .input("renovacion_automatica", renovacion)
      .input("fecha_pago", fechaPago)
      .query(`
        INSERT INTO membresias (
          user_id,
          plan_id,
          stripe_subscription_id,
          stripe_customer_id,
          fecha_inicio,
          fecha_expiracion,
          estado,
          renovacion_automatica,
          fecha_pago,
          fecha_creacion,
          fecha_actualizacion
        ) VALUES (
          @user_id,
          @plan_id,
          @stripe_subscription_id,
          @stripe_customer_id,
          @fecha_inicio,
          @fecha_expiracion,
          @estado,
          @renovacion_automatica,
          @fecha_pago,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        )
      `);
    return;
  }

  await db
    .request()
    .input("stripe_subscription_id", subscription.id)
    .input("stripe_customer_id", customerId ?? null)
    .input("fecha_inicio", fechaInicio)
    .input("fecha_expiracion", fechaExpiracion)
    .input("estado", estado)
    .input("renovacion_automatica", renovacion)
    .input("fecha_pago", fechaPago)
    .query(`
      UPDATE membresias
      SET
        stripe_customer_id = @stripe_customer_id,
        fecha_inicio = @fecha_inicio,
        fecha_expiracion = @fecha_expiracion,
        estado = @estado,
        renovacion_automatica = @renovacion_automatica,
        fecha_pago = @fecha_pago,
        fecha_actualizacion = SYSUTCDATETIME()
      WHERE stripe_subscription_id = @stripe_subscription_id
    `);
}

async function markCanceledSubscription(subscription: StripeSubscriptionWithPeriods): Promise<void> {
  const db = await getDb();
  await db
    .request()
    .input("stripe_subscription_id", subscription.id)
    .query(`
      UPDATE membresias
      SET
        estado = 'cancelada',
        renovacion_automatica = 0,
        fecha_cancelacion = SYSUTCDATETIME(),
        fecha_actualizacion = SYSUTCDATETIME()
      WHERE stripe_subscription_id = @stripe_subscription_id
    `);
}

async function saveWebhookEvent(event: Stripe.Event): Promise<void> {
  const db = await getDb();
  await db
    .request()
    .input("stripe_event_id", event.id)
    .input("tipo_evento", event.type)
    .input("datos", JSON.stringify(event))
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM stripe_webhooks WHERE stripe_event_id = @stripe_event_id
      )
      BEGIN
        INSERT INTO stripe_webhooks (stripe_event_id, tipo_evento, datos, procesado, fecha_creacion)
        VALUES (@stripe_event_id, @tipo_evento, @datos, 1, SYSUTCDATETIME())
      END
    `);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Firma faltante" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature error", (err as Error).message);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    await saveWebhookEvent(event);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && typeof session.subscription === "string") {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(session.subscription) as StripeSubscriptionWithPeriods;
          await upsertMembershipFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as StripeSubscriptionWithPeriods;
        await upsertMembershipFromSubscription(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscriptionWithPeriods;
        await markCanceledSubscription(subscription);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] processing error", (err as Error).message);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }
}
