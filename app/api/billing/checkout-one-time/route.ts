import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { isFreemiumOwner } from "@/lib/freemium";
import {
  currentPeriod,
  getOneTimePricing,
  isOneTimeTipo,
  type OneTimeTipo,
} from "@/lib/one-time-purchases";

export const runtime = "nodejs";

interface UserRow {
  stripe_customer_id: string | null;
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

  let body: { tipo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  if (!isOneTimeTipo(body.tipo)) {
    return NextResponse.json({ error: "tipo invalido" }, { status: 422 });
  }
  const tipo: OneTimeTipo = body.tipo;

  try {
    const isFreemium = await isFreemiumOwner(session);

    // Regla de negocio:
    //  - cuadro_download        => solo freemium (los de plan ya tienen el export)
    //  - comparar_auditar_mes   => solo usuarios con plan (freemium primero se
    //    suscribe; el upsell del modal existente los lleva a /pricing)
    if (tipo === "cuadro_download" && !isFreemium) {
      return NextResponse.json(
        { error: "Ya tienes plan; no necesitas comprar descargas sueltas" },
        { status: 403 },
      );
    }
    if (tipo === "comparar_auditar_mes" && isFreemium) {
      return NextResponse.json(
        { error: "Comparar y Auditar requiere plan activo" },
        { status: 403 },
      );
    }

    const db = await getDb();
    const pricing = await getOneTimePricing(db, tipo);
    if (!pricing) {
      return NextResponse.json(
        { error: "Producto no configurado. Contacta a soporte." },
        { status: 503 },
      );
    }

    // 1. Reutiliza el customer de Stripe o crealo (misma logica que /checkout)
    const userResult = await db
      .request()
      .input("id", session.sub)
      .query<UserRow>(`SELECT stripe_customer_id FROM users WHERE id = @id`);
    const userRow = userResult.recordset[0];
    if (!userRow) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const stripe = getStripe();
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

    // 2. Periodo (solo para comparar_auditar_mes; se guarda en metadata para que
    //    el webhook no dependa de la fecha del server al momento de procesarlo)
    const { year, month } = currentPeriod();
    const baseUrl = getAppBaseUrl();

    const successPath =
      tipo === "cuadro_download"
        ? "/dashboard/facturas?onetime=cuadro"
        : "/dashboard/estados-financieros?onetime=comparar_auditar";
    const cancelPath =
      tipo === "cuadro_download"
        ? "/dashboard/facturas?onetime=cancel"
        : "/dashboard/estados-financieros?onetime=cancel";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: pricing.priceId, quantity: 1 }],
      success_url: `${baseUrl}${successPath}`,
      cancel_url: `${baseUrl}${cancelPath}`,
      metadata: {
        userId: session.sub,
        tipo,
        periodoYear: String(year),
        periodoMonth: String(month),
      },
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "No se pudo crear la sesion" }, { status: 500 });
    }

    // 3. Registra la compra como pendiente (el webhook la pasa a 'pagada').
    //    Si por reintento del cliente ya existe fila con este session_id, el
    //    UNIQUE index la bloquea y hacemos ignore.
    try {
      await db
        .request()
        .input("user_id", session.sub)
        .input("tipo", tipo)
        .input("sess", checkoutSession.id)
        .input("monto", pricing.amountCents)
        .input("y", tipo === "comparar_auditar_mes" ? year : null)
        .input("m", tipo === "comparar_auditar_mes" ? month : null)
        .query(`
          INSERT INTO AIC_compras_unicas
            (user_id, tipo, stripe_session_id, monto_centavos, estado,
             periodo_year, periodo_month)
          VALUES
            (@user_id, @tipo, @sess, @monto, 'pendiente', @y, @m)
        `);
    } catch (err) {
      // No es fatal: el webhook puede insertar si esta fila no existe.
      console.error("[checkout-one-time] insert pendiente fallo:", (err as Error).message);
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[billing/checkout-one-time]", (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo iniciar checkout" },
      { status: 500 },
    );
  }
}
