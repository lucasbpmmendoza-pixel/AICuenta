/**
 * Overrides hardcodeados por correo.
 *
 * Cuentas de la lista blanca se tratan como NO-freemium y con RFC ilimitados,
 * sin importar su plan/membresia en BD. Pensado para cuentas internas de
 * contadores. Es la unica fuente de verdad: la usan `lib/account-plan.ts`
 * (limite de RFCs) y `lib/freemium.ts` (candado freemium).
 */

// Correos con RFC ilimitados y sin candado freemium. Normalizar en minusculas.
const UNLIMITED_EMAILS = new Set<string>([
  "contadores.mmendoza@gmail.com",
]);

// Valor "ilimitado" para maxRfcs / maxMembers. Grande pero seguro para JS.
export const UNLIMITED_LIMIT = Number.MAX_SAFE_INTEGER;

export function isUnlimitedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return UNLIMITED_EMAILS.has(email.trim().toLowerCase());
}
