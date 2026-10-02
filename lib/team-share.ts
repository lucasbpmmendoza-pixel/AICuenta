import type { ConnectionPool } from "mssql";

/**
 * Compartir un RFC (EFIELES) con TODOS los miembros del equipo del owner, de
 * golpe, en vez de asignarlo miembro por miembro desde Usuarios. Escribe en la
 * misma tabla member_rfcs que usan /api/rfcs y validateRfcAccess.
 *
 * Solo aplica a los miembros que existen hoy: un miembro que se agregue despues
 * hay que asignarlo (o volver a compartir el RFC).
 */

/** Asigna el RFC a todos los miembros del owner que aun no lo tengan. */
export async function shareRfcWithTeam(db: ConnectionPool, ownerId: string, efielId: string): Promise<void> {
  await db
    .request()
    .input("ownerId", ownerId)
    .input("efielId", efielId)
    .query(`
      INSERT INTO member_rfcs (member_id, efiel_id)
      SELECT u.id, @efielId
      FROM   users u
      WHERE  u.owner_id = @ownerId AND u.role = 'member'
        AND  NOT EXISTS (SELECT 1 FROM member_rfcs mr
                         WHERE mr.member_id = u.id AND mr.efiel_id = @efielId)
    `);
}

/** Quita el RFC a todos los miembros del owner. */
export async function unshareRfcWithTeam(db: ConnectionPool, ownerId: string, efielId: string): Promise<void> {
  await db
    .request()
    .input("ownerId", ownerId)
    .input("efielId", efielId)
    .query(`
      DELETE mr
      FROM   member_rfcs mr
      INNER JOIN users u ON u.id = mr.member_id
      WHERE  mr.efiel_id = @efielId AND u.owner_id = @ownerId AND u.role = 'member'
    `);
}
