import { timingSafeEqual } from "crypto";
import type { JWTPayload } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * Acceso maquina-a-maquina a los cuadros (lo usa excel-drive-sync para subir
 * el Excel mensual a Drive). Se autentica con el header X-API-Key contra
 * INTERNAL_CUADROS_API_KEY y actua SIEMPRE como la cuenta de contadores
 * (CONTADORES_ACCOUNT_EMAIL): solo ve los RFCs de esa cuenta y pasa por los
 * mismos candados que la sesion normal (freemium, cuota, acceso al RFC).
 */

export function hasValidInternalKey(req: Request): boolean {
  const expected = process.env.INTERNAL_CUADROS_API_KEY?.trim();
  const given = req.headers.get("x-api-key")?.trim();
  if (!expected || expected.length < 32 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function loadContadoresSession(): Promise<JWTPayload | null> {
  const email = process.env.CONTADORES_ACCOUNT_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const db = await getDb();
  const r = await db
    .request()
    .input("email", email)
    .query<{ id: string; name: string; email: string; is_active: boolean; role: string | null; owner_id: string | null }>(
      `SELECT id, name, email, is_active, role, owner_id
       FROM users WITH (NOLOCK)
       WHERE email = @email`
    );
  const user = r.recordset[0];
  if (!user || !user.is_active) return null;
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: (user.role ?? "owner") as JWTPayload["role"],
    ...(user.owner_id ? { ownerId: user.owner_id } : {}),
  };
}

/**
 * Regla de acceso "de equipo" para la cuenta de contadores: los EFIELES del
 * owner mas los compartidos por member_rfcs con el propio usuario O con
 * cualquier miembro de su equipo (asi se comparten los RFCs de otras cuentas,
 * p.ej. los de mauricio_mendoza@live.com.mx). Mas amplia que validateRfcAccess,
 * que para un owner solo ve lo compartido con el directamente; por eso vive
 * aqui y solo la usa la API interna.
 */
const TEAM_ACCESS_WHERE = `
  (e.user_id = @uid
   OR EXISTS (SELECT 1
              FROM member_rfcs mr WITH (NOLOCK)
              LEFT JOIN users m WITH (NOLOCK) ON m.id = mr.member_id
              WHERE mr.efiel_id = e.id
                AND (mr.member_id = @memberId OR m.owner_id = @uid)))`;

export async function hasTeamRfcAccess(session: JWTPayload, rfc: string): Promise<boolean> {
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
       WHERE e.rfc = @rfc AND ${TEAM_ACCESS_WHERE}`
    );
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

/** RFCs a los que tiene acceso el equipo de la sesion (ver TEAM_ACCESS_WHERE). */
export async function listAccessibleRfcs(session: JWTPayload): Promise<{ rfc: string; alias: string | null; nombre: string | null }[]> {
  const ownerId = session.ownerId ?? session.sub;
  const db = await getDb();
  const r = await db
    .request()
    .input("uid", ownerId)
    .input("memberId", session.sub)
    .query<{ rfc: string; alias: string | null; nombre: string | null }>(
      `SELECT DISTINCT e.rfc, e.alias, cli.name AS nombre
       FROM EFIELES e WITH (NOLOCK)
       OUTER APPLY (
         SELECT TOP 1 tc.name
         FROM tb_clientes tc WITH (NOLOCK)
         WHERE tc.rfc = e.rfc
       ) cli
       WHERE ${TEAM_ACCESS_WHERE}
       ORDER BY e.rfc`
    );
  return r.recordset;
}
