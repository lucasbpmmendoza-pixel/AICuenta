import type { JWTPayload } from "@/lib/auth";

export const DEMO_COOKIE_NAME = "demo_mode";

export function isDemoCookieEnabled(value: string | undefined): boolean {
  return value === "1";
}

// Correos que, aun estando autenticados, ven los datos de la demo
// (numeros ficticios, no ligados a ninguna institucion real) -- solo para Martin (marketing).
export const DEMO_ALLOWED_EMAILS = new Set<string>([
  "martinoa.mmendoza@gmail.com",
]);

export function isDemoEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return DEMO_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export function buildDemoSession(): JWTPayload {
  return {
    sub: "demo-user",
    email: "demo@aicuenta.local",
    name: "Demo AIcuenta",
    role: "owner",
    isDemo: true,
  };
}

export function isDemoSession(session: JWTPayload | null | undefined): boolean {
  return !!session?.isDemo;
}
