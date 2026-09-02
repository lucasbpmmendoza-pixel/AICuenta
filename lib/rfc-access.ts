import type { JWTPayload } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * Valida que la sesion tenga acceso al RFC.
 *
 * - Owner: los RFC de su propia cuenta (EFIELES.user_id).
 * - Member: los de su owner, mas los que el owner le asigno explicitamente en
 *   member_rfcs — esos pueden pertenecer a otra cuenta (otro user_id), que es
 *   como se comparte un RFC entre despachos sin moverlo de dueno.
 *
 * Misma fuente que usa /api/rfcs para armar el selector, para que lo que se ve
 * en la lista sea exactamente lo que se puede abrir.
 */
export async function validateRfcAccess(session: JWTPayload, rfc: string): Promise<boolean> {
  const ownerId = session.ownerId ?? session.sub;
  const db = await getDb();
  const r = await db
    .request()
    .input("uid", ownerId)
    .input("memberId", session.sub)
    .input("rfc", rfc)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM EFIELES e WITH (NOLOCK)
       WHERE e.rfc = @rfc
         AND (e.user_id = @uid
              OR EXISTS (SELECT 1
                         FROM member_rfcs mr WITH (NOLOCK)
                         WHERE mr.efiel_id = e.id AND mr.member_id = @memberId))`
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}
