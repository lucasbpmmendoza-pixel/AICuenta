import type { JWTPayload } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type MembershipState = {
  isFree: boolean;
  estado: string | null;
  planId: number | null;
};

const PAID_ESTADOS = new Set(["activa", "trial"]);

/**
 * Resuelve si el usuario es freemium consultando `membresias`.
 * Free = no hay fila con estado in ('activa','trial') para el owner efectivo.
 * Para miembros, se mira el ownerId (los miembros heredan la membresia del owner).
 *
 * Demo siempre se considera de pago para que el demo pueda mostrar todo.
 */
export async function resolveMembership(session: JWTPayload | null): Promise<MembershipState> {
  if (!session) return { isFree: true, estado: null, planId: null };
  if (session.isDemo) return { isFree: false, estado: "demo", planId: null };

  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("uid", effectiveUserId)
      .query<{ estado: string; plan_id: number }>(
        `SELECT TOP 1 estado, plan_id
         FROM membresias
         WHERE user_id = @uid AND estado IN ('activa', 'trial')
         ORDER BY fecha_expiracion DESC`,
      );

    const row = result.recordset[0];
    if (!row) return { isFree: true, estado: null, planId: null };

    const isFree = !PAID_ESTADOS.has(row.estado);
    return { isFree, estado: row.estado, planId: row.plan_id };
  } catch (err) {
    console.error("[membership] resolveMembership error:", (err as Error).message);
    // Fail-closed: si la consulta falla, tratar como freemium (no premium gratis por bug).
    return { isFree: true, estado: null, planId: null };
  }
}

/**
 * Atajo booleano para usar en route handlers.
 */
export async function isFreemium(session: JWTPayload | null): Promise<boolean> {
  const { isFree } = await resolveMembership(session);
  return isFree;
}

/**
 * Decide si los parametros de un endpoint de export representan EXCLUSIVAMENTE
 * el mes calendario en curso. Las cuentas gratis solo pueden descargar
 * el mes actual; cualquier otro periodo (anual, trimestral, mes pasado o
 * rango personalizado) queda bloqueado.
 */
export function freemiumCanDownloadMonth(args: {
  year: number;
  month: string | null;
  quarter: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}): boolean {
  if (args.quarter !== null) return false;
  if (args.dateFrom || args.dateTo) return false;
  if (args.month === null) return false;

  const monthN = parseInt(args.month, 10);
  if (!Number.isInteger(monthN) || monthN < 1 || monthN > 12) return false;
  if (!Number.isInteger(args.year)) return false;

  const now = new Date();
  return args.year === now.getFullYear() && monthN === now.getMonth() + 1;
}
