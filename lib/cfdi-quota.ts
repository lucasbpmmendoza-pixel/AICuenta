import type sql from "mssql";
import type { JWTPayload } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isDemoSession } from "@/lib/demo-mode";
import { isUnlimitedEmail } from "@/lib/plan-overrides";

/**
 * Cuota de CFDIs por plan.
 *
 * El limite de una cuenta ya NO es el numero de RFCs, sino el TOTAL de CFDIs
 * (recibidos+emitidos, ventana de 5 anios) sumado sobre todos los RFCs del
 * dueno, contra el tope de su plan (`plans.cfdis_5_anios`). El conteo vive en
 * `dbo.conteo_cfdi`, poblada mes a mes por el job contarSAT_bd.php.
 *
 * Regla de oro (igual que lib/freemium.ts): este modulo NUNCA debe bloquear a
 * quien paga por un error de lectura. Ante cualquier fallo hace FAIL-OPEN =>
 * overQuota=false. El candado real vive en cada endpoint de export/descarga.
 */

export type CfdiQuota = {
  cap: number | null; // tope del plan; null = sin tope (sin plan con limite, o correo interno)
  used: number; // suma de CFDIs (5 anios) de todos los RFCs del dueno
  overQuota: boolean; // used > cap (solo cuando cap != null)
  hasPlan: boolean; // tiene membresia activa/trial vigente
};

// Ventana de 5 anios, identica a la de app/api/rfcs/route.ts (fuente unica de verdad del criterio).
const CFDIS_5A_WINDOW =
  "(anio * 100 + mes) >= (YEAR(DATEADD(YEAR, -4, GETDATE())) * 100 + MONTH(GETDATE()))";

export const CFDI_QUOTA_EXCEEDED_MESSAGE =
  "Excediste el total de CFDIs que permite tu plan. Elimina uno o mas RFCs para volver a descargar y exportar.";

/**
 * Lee el tope de CFDIs del plan activo del dueno y cuanto lleva usado.
 * Fail-open: ante error devuelve { cap: null, overQuota: false }.
 */
export async function loadOwnerCfdiQuota(
  db: sql.ConnectionPool,
  ownerId: string,
): Promise<CfdiQuota> {
  try {
    // Tope del plan activo (membresia activa/trial vigente) + email para override.
    const capRes = await db
      .request()
      .input("id", ownerId)
      .query<{ email: string | null; cap: number | null }>(`
        SELECT
          u.email,
          (
            SELECT TOP 1 p.cfdis_5_anios
            FROM membresias m WITH (NOLOCK)
            JOIN plans p ON p.id = m.plan_id
            WHERE m.user_id = u.id
              AND m.estado IN ('activa', 'trial')
              AND (m.fecha_expiracion IS NULL OR m.fecha_expiracion > GETDATE())
            ORDER BY m.fecha_creacion DESC
          ) AS cap
        FROM users u
        WHERE u.id = @id
      `);
    const row = capRes.recordset[0];
    const hasPlan = row?.cap != null;

    // Correos internos: sin tope, nunca sobre cuota.
    if (isUnlimitedEmail(row?.email)) {
      return { cap: null, used: 0, overQuota: false, hasPlan };
    }

    const cap: number | null = row?.cap ?? null;

    // Uso: suma de CFDIs (5 anios) de todos los RFCs del dueno.
    const useRes = await db
      .request()
      .input("id", ownerId)
      .query<{ used: number }>(`
        SELECT COALESCE(SUM(c.cfdis_5a), 0) AS used
        FROM EFIELES e
        LEFT JOIN (
          SELECT rfc, SUM(total) AS cfdis_5a
          FROM dbo.conteo_cfdi
          WHERE ${CFDIS_5A_WINDOW}
          GROUP BY rfc
        ) c ON c.rfc = e.rfc
        WHERE e.user_id = @id
      `);
    const used = Number(useRes.recordset[0]?.used ?? 0);
    const overQuota = cap != null && used > cap;

    return { cap, used, overQuota, hasPlan };
  } catch (err) {
    console.error("[cfdi-quota] fallback:", (err as Error).message);
    return { cap: null, used: 0, overQuota: false, hasPlan: false };
  }
}

/**
 * ¿El dueno de esta sesion esta por encima de su cuota de CFDIs? Demo nunca lo
 * esta. Fail-open => false ante cualquier error.
 */
export async function isOwnerOverCfdiQuota(session: JWTPayload): Promise<boolean> {
  if (isDemoSession(session)) return false;
  try {
    const db = await getDb();
    const ownerId = session.ownerId ?? session.sub;
    const quota = await loadOwnerCfdiQuota(db, ownerId);
    return quota.overQuota;
  } catch {
    return false;
  }
}

/**
 * Guard para endpoints de export/descarga: devuelve una Response 403 lista si
 * el dueno esta sobre su cuota, o null si puede continuar. Sirve tanto para
 * rutas que usan `new Response(...)` como `NextResponse.json(...)`.
 */
export async function exportQuotaBlock(session: JWTPayload): Promise<Response | null> {
  if (await isOwnerOverCfdiQuota(session)) {
    return new Response(CFDI_QUOTA_EXCEEDED_MESSAGE, { status: 403 });
  }
  return null;
}
