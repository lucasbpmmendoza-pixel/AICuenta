// scripts/seed-stripe-live.js
// Crea el producto + los 5 precios en LIVE e imprime el SQL para tu base de datos.
// Correr UNA sola vez. Uso:
//   $env:STRIPE_SECRET_KEY = "sk_live_xxx"   (PowerShell)
//   node scripts/seed-stripe-live.js
const Stripe = require("stripe");

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Falta STRIPE_SECRET_KEY en el entorno.");
  process.exit(1);
}
// Guarda de seguridad: evita crear sin querer en modo TEST
if (!key.startsWith("sk_live_")) {
  console.error("La llave NO es de live (sk_live_...). Aborto para no crear en test.");
  process.exit(1);
}

const stripe = new Stripe(key);

const PLANES = [
  { costo: 240, cfdis: 6000 },
  { costo: 450, cfdis: 10000 },
  { costo: 800, cfdis: 20000 },
  { costo: 1500, cfdis: 40000 },
  { costo: 3000, cfdis: 80000 },
];

(async () => {
  const product = await stripe.products.create({
    name: "AICuenta",
    description: "Suscripcion AICuenta",
  });

  console.log("\nproduct (live):", product.id, "\n");
  console.log("-- Copia y corre esto en tu base de datos --\n");

  let nivel = 1;
  for (const p of PLANES) {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: p.costo * 100,
      currency: "mxn",
      recurring: { interval: "month" },
      nickname: `Plan ${nivel}`,
      metadata: { nivel: String(nivel), cfdis_5_anios: String(p.cfdis) },
    });
    console.log(
      `UPDATE plans SET stripe_product_id='${product.id}', stripe_price_id='${price.id}' WHERE costo=${p.costo};`,
    );
    nivel++;
  }
  console.log("");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
