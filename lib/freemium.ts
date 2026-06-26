import type sql from "mssql";
import type { JWTPayload } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";

/**
 * Tier freemium de AICuenta.
 *
 * Una cuenta es "freemium" mientras su dueño NO tiene una membresia
 * activa/trial vigente en la tabla `membresias` (la misma que escribe el
 * webhook de Stripe en app/api/billing/webhook/route.ts). Es un estado
 * DERIVADO: no requiere columna ni tabla nueva.
 *
 * Regla de oro (leccion del intento revertido 2026-06-24, que rompio el deploy
 * en Vercel con un layout async que importaba la DB): este modulo NUNCA debe
 * tumbar el render ni bloquear a quien paga. Ante cualquier error de lectura
 * hace FAIL-OPEN => isFreemium=false. El candado real vive en cada endpoint.
 */

// Rutas del dashboard bloqueadas para freemium (se muestran con candado + upsell).
//  - /dashboard/chat        => FinDoc
//  - /dashboard/comprobantes => Scan Bot
//  - /dashboard/unete        => AIChikenelo
// (FiscalGPT = /dashboard/chat-docs queda permitido.)
export const FREEMIUM_BLOCKED_ROUTES = [
  "/dashboard/chat",
  "/dashboard/comprobantes",
  "/dashboard/unete",
] as const;

export const FREEMIUM_FORBIDDEN_MESSAGE =
  "Esta funcion esta disponible solo en planes de pago. Mejora tu plan para usarla.";

export type AccountAccess = {
  // account_type crudo (string|null). Las pages siguen decidiendo el redirect
  // a /upload-fiel cuando es null, igual que hoy.
  accountType: string | null;
  isFreemium: boolean;
};

/**
 * Lee account_type + si el dueño tiene membresia activa/trial vigente, en un
 * solo round-trip. Reemplaza el `SELECT account_type FROM users` inline de las
 * pages del dashboard. Fail-open total.
 */
export async function loadAccountAccess(
  db: sql.ConnectionPool,
  ownerId: string,
): Promise<AccountAccess> {
  try {
    const result = await db
      .request()
      .input("id", ownerId)
      .query<{ account_type: string | null; has_active: number | null }>(`
        SELECT
          u.account_type,
          (
            SELECT TOP 1 1
            FROM membresias m WITH (NOLOCK)
            WHERE m.user_id = u.id
              AND m.estado IN ('activa', 'trial')
              AND (m.fecha_expiracion IS NULL OR m.fecha_expiracion > GETDATE())
          ) AS has_active
        FROM users u
        WHERE u.id = @id
      `);
    const row = result.recordset[0];
    return {
      accountType: row?.account_type ?? null,
      isFreemium: !row?.has_active, // sin membresia activa => freemium
    };
  } catch (err) {
    // Respaldo: si `membresias` no existe en este entorno, al menos lee
    // account_type y trata la cuenta como NO-freemium (no bloquear a nadie).
    console.error("[freemium] loadAccountAccess fallback:", (err as Error).message);
    try {
      const r = await db
        .request()
        .input("id", ownerId)
        .query<{ account_type: string | null }>(
          "SELECT account_type FROM users WHERE id = @id",
        );
      return { accountType: r.recordset[0]?.account_type ?? null, isFreemium: false };
    } catch {
      return { accountType: null, isFreemium: false };
    }
  }
}

/**
 * Helper para Route Handlers / Server Actions: ¿el dueño de esta sesion es
 * freemium? Demo nunca es freemium. Fail-open => false ante cualquier error.
 */
export async function isFreemiumOwner(session: JWTPayload): Promise<boolean> {
  if (isDemoSession(session)) return false;
  try {
    const db = await getDb();
    const ownerId = session.ownerId ?? session.sub;
    const access = await loadAccountAccess(db, ownerId);
    return access.isFreemium;
  } catch {
    return false;
  }
}

/** Mes actual (hora local del server; en Vercel = UTC), para clamping de periodo. */
export function currentMonthPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
