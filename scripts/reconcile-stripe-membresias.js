// scripts/reconcile-stripe-membresias.js
// Sincroniza membresias con las suscripciones reales de Stripe. Red de
// seguridad por si el webhook no llego o fallo (ver app/api/billing/webhook).
//   - Suscripcion viva en Stripe sin fila en membresias  -> INSERT
//   - Fila existente con estado/expiracion desfasados     -> UPDATE
// Por defecto es DRY-RUN (solo imprime). Para escribir: --apply
// Uso:
//   node --env-file=.env scripts/reconcile-stripe-membresias.js
//   node --env-file=.env scripts/reconcile-stripe-membresias.js --apply
const Stripe = require("stripe");
const sql = require("mssql");

const APPLY = process.argv.includes("--apply");

// Mismo mapeo que mapEstado() del webhook (CK_membresias_estado)
function mapEstado(status) {
  switch (status) {
    case "trialing":
    case "active":
      return "activa";
    case "canceled":
      return "cancelada";
    case "incomplete_expired":
      return "expirada";
    default:
      return "suspendida";
  }
}

(async () => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const pool = await sql.connect({
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    port: Number(process.env.AZURE_SQL_PORT ?? 1433),
    options: { encrypt: true },
  });

  const users = (await pool.request().query(
    "SELECT id, email, stripe_customer_id FROM users WHERE stripe_customer_id IS NOT NULL",
  )).recordset;
  const userByCustomer = new Map(users.map((u) => [u.stripe_customer_id, u]));

  const plans = (await pool.request().query(
    "SELECT id, stripe_price_id FROM plans WHERE stripe_price_id IS NOT NULL",
  )).recordset;
  const planByPrice = new Map(plans.map((p) => [p.stripe_price_id, p.id]));

  console.log(APPLY ? "== MODO APPLY (escribe en BD) ==" : "== DRY-RUN (no escribe; usa --apply) ==");

  let cambios = 0;
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = userByCustomer.get(customerId);
    const userId = user?.id ?? sub.metadata?.userId;
    const item = sub.items.data[0];
    const planId = planByPrice.get(item?.price?.id) ?? Number(sub.metadata?.planId);
    const estado = mapEstado(sub.status);
    const inicio = new Date((item?.current_period_start ?? sub.start_date) * 1000);
    const expira = new Date(item?.current_period_end * 1000);
    const renov = sub.cancel_at_period_end ? 0 : 1;
    const tag = `${sub.id} [${sub.status}] ${user?.email ?? customerId}`;

    if (!userId) {
      console.warn(`SKIP ${tag}: customer sin usuario en BD`);
      continue;
    }
    if (!Number.isInteger(planId)) {
      console.warn(`SKIP ${tag}: price ${item?.price?.id} no esta en plans`);
      continue;
    }

    const existing = (await pool.request()
      .input("sub", sub.id)
      .query("SELECT id, estado, fecha_expiracion, plan_id FROM membresias WHERE stripe_subscription_id = @sub")
    ).recordset[0];

    if (!existing) {
      // Canceladas que nunca se registraron no aportan nada (no dan acceso)
      if (estado === "cancelada" || estado === "expirada") continue;
      console.log(`INSERT ${tag} -> plan ${planId}, ${estado}, expira ${expira.toISOString().slice(0, 10)}`);
      cambios++;
      if (APPLY) {
        await pool.request()
          .input("user_id", userId)
          .input("plan_id", planId)
          .input("sub", sub.id)
          .input("cust", customerId)
          .input("inicio", inicio)
          .input("expira", expira)
          .input("estado", estado)
          .input("renov", renov)
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
      }
      continue;
    }

    const mismaExp = existing.fecha_expiracion &&
      Math.abs(new Date(existing.fecha_expiracion) - expira) < 24 * 3600 * 1000;
    if (existing.estado === estado && mismaExp && existing.plan_id === planId) continue;

    console.log(`UPDATE ${tag}: ${existing.estado}->${estado}, plan ${existing.plan_id}->${planId}, expira ${expira.toISOString().slice(0, 10)}`);
    cambios++;
    if (APPLY) {
      await pool.request()
        .input("id", existing.id)
        .input("plan_id", planId)
        .input("expira", expira)
        .input("estado", estado)
        .input("renov", renov)
        .query(`
          UPDATE membresias
          SET plan_id = @plan_id, fecha_expiracion = @expira, estado = @estado,
              renovacion_automatica = @renov, fecha_actualizacion = GETDATE()
          WHERE id = @id
        `);
    }
  }

  console.log(`${cambios} cambio(s) ${APPLY ? "aplicados" : "pendientes"}.`);
  await pool.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
