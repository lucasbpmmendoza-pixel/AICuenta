import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

// mssql requiere el runtime de Node (no Edge)
export const runtime = "nodejs";

// ── Helpers de la API de Stripe (esta version: 2026-05-27.dahlia) ──────────

// En esta version el periodo vive en el item, no en la suscripcion
function periodStart(sub: Stripe.Subscription): Date {
  const secs = sub.items.data[0]?.current_period_start ?? sub.start_date;
  return new Date(secs * 1000);
}
function periodEnd(sub: Stripe.Subscription): Date {
  const secs = sub.items.data[0]?.current_period_end;
  return new Date(secs * 1000);
}

// La factura ya no trae `subscription`; vive en parent.subscription_details
function subIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription ?? null;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

function toId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

// Mapea el status de Stripe a tu columna estado varchar(20)
function mapEstado(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "activa";
    case "past_due":
    case "unpaid":
      return "morosa";
    case "canceled":
      return "cancelada";
    default:
      return status; // incomplete, paused, etc.
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Falta la firma" }, { status: 400 });
  }

  const stripe = getStripe();

  // 1. Verificar firma sobre el cuerpo CRUDO (sin parsear)
  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    console.error("[billing/webhook] firma invalida:", (err as Error).message);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    const db = await getDb();

    // 2. Idempotencia: guarda el evento crudo y evita reprocesar
    const existing = await db
      .request()
      .input("eid", event.id)
      .query<{ procesado: boolean }>(
        `SELECT procesado FROM stripe_webhooks WHERE stripe_event_id = @eid`,
      );

    if (existing.recordset.length > 0) {
      if (existing.recordset[0].procesado) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Existe pero quedo sin procesar (reintento tras una falla): continua
    } else {
      await db
        .request()
        .input("eid", event.id)
        .input("tipo", event.type)
        .input("datos", JSON.stringify(event))
        .query(`
          INSERT INTO stripe_webhooks (stripe_event_id, tipo_evento, datos, procesado, fecha_creacion)
          VALUES (@eid, @tipo, @datos, 0, GETDATE())
        `);
    }

    // 3. Procesar segun el tipo
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = Number(session.metadata?.planId);
        const subscriptionId = toId(session.subscription);
        const customerId = toId(session.customer);

        if (!userId || !subscriptionId || !Number.isInteger(planId)) {
          console.error("[billing/webhook] checkout sin metadata util", session.id);
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const estado = mapEstado(sub.status);

        // Upsert por stripe_subscription_id (idempotente ante reentregas)
        const exists = await db
          .request()
          .input("sub", subscriptionId)
          .query(`SELECT id FROM membresias WHERE stripe_subscription_id = @sub`);

        if (exists.recordset.length === 0) {
          await db
            .request()
            .input("user_id", userId)
            .input("plan_id", planId)
            .input("sub", subscriptionId)
            .input("cust", customerId)
            .input("inicio", periodStart(sub))
            .input("expira", periodEnd(sub))
            .input("estado", estado)
            .input("renov", sub.cancel_at_period_end ? 0 : 1)
            .query(`
              INSERT INTO membresias
                (user_id, plan_id, stripe_subscription_id, stripe_customer_id,
                 fecha_inicio, fecha_expiracion, estado, renovacion_automatica,
                 fecha_creacion, fecha_actualizacion)
              VALUES
                (@user_id, @plan_id, @sub, @cust,
                 @inicio, @expira, @estado, @renov,
                 GETDATE(), GETDATE())
            `);
        } else {
          await db
            .request()
            .input("sub", subscriptionId)
            .input("expira", periodEnd(sub))
            .input("estado", estado)
            .query(`
              UPDATE membresias
              SET fecha_expiracion = @expira, estado = @estado, fecha_actualizacion = GETDATE()
              WHERE stripe_subscription_id = @sub
            `);
        }

        // Refleja el plan activo en el usuario
        await db
          .request()
          .input("user_id", userId)
          .input("plan", String(planId))
          .query(`UPDATE users SET plan_type = @plan WHERE id = @user_id`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .request()
          .input("sub", sub.id)
          .input("estado", mapEstado(sub.status))
          .input("expira", periodEnd(sub))
          .input("renov", sub.cancel_at_period_end ? 0 : 1)
          .query(`
            UPDATE membresias
            SET estado = @estado,
                fecha_expiracion = @expira,
                renovacion_automatica = @renov,
                fecha_actualizacion = GETDATE()
            WHERE stripe_subscription_id = @sub
          `);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .request()
          .input("sub", sub.id)
          .input("razon", sub.cancellation_details?.reason ?? null)
          .query(`
            UPDATE membresias
            SET estado = 'cancelada',
                renovacion_automatica = 0,
                fecha_cancelacion = GETDATE(),
                razon_cancelacion = @razon,
                fecha_actualizacion = GETDATE()
            WHERE stripe_subscription_id = @sub
          `);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subIdFromInvoice(invoice);
        if (!subscriptionId) break;

        // Trae el periodo nuevo desde la suscripcion (fuente autoritativa)
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await db
          .request()
          .input("sub", subscriptionId)
          .input("expira", periodEnd(sub))
          .query(`
            UPDATE membresias
            SET estado = 'activa',
                fecha_pago = GETDATE(),
                fecha_expiracion = @expira,
                fecha_actualizacion = GETDATE()
            WHERE stripe_subscription_id = @sub
          `);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subIdFromInvoice(invoice);
        if (!subscriptionId) break;

        await db
          .request()
          .input("sub", subscriptionId)
          .query(`
            UPDATE membresias
            SET estado = 'morosa', fecha_actualizacion = GETDATE()
            WHERE stripe_subscription_id = @sub
          `);
        // TODO: avisar al usuario por correo (Resend ya esta en el proyecto)
        break;
      }

      default:
        // Otros eventos se guardan pero no requieren accion
        break;
    }

    // 4. Marcar como procesado
    await db
      .request()
      .input("eid", event.id)
      .query(`UPDATE stripe_webhooks SET procesado = 1 WHERE stripe_event_id = @eid`);

    return NextResponse.json({ received: true });
  } catch (err) {
    // Devolver 500 hace que Stripe reintdente; procesado sigue en 0
    console.error("[billing/webhook] error procesando:", (err as Error).message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
