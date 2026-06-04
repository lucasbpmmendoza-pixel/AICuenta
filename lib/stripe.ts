import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2026-05-27.dahlia",
  });

  return stripeClient;
}

export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is required");
  }
  return url.replace(/\/$/, "");
}
