import { getDb } from "@/lib/db";

/**
 * Devuelve "/upload-fiel" si el usuario no tiene EFIEL configurada,
 * "/dashboard" si ya la tiene.
 */
export async function getPostLoginRedirect(userId: string): Promise<string> {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("userId", userId)
      .query<{ cnt: number }>(
        `SELECT COUNT(1) AS cnt FROM EFIELES WHERE user_id = @userId`,
      );
    const count = result.recordset[0]?.cnt ?? 0;
    return count > 0 ? "/dashboard" : "/upload-fiel";
  } catch (err) {
    console.error("[getPostLoginRedirect] DB error:", (err as Error).message);
    // Si falla la consulta, mandamos al dashboard por defecto
    return "/dashboard";
  }
}

/**
 * ¿El usuario tiene al menos una e.firma (EFIEL) configurada?
 *
 * Se usa para decidir el "modo XML" del dashboard: un usuario con cuenta pero SIN
 * e.firma no tiene CFDIs descargados del SAT, así que su Dashboard / Estados
 * Financieros / Facturas se alimentan de los XML que sube en "Crea tus cuadros".
 *
 * FAIL-SAFE: ante cualquier error de lectura devuelve `true` (asume que sí tiene),
 * para nunca mandar por error a un usuario de pago al modo XML.
 */
export async function userHasEfiel(userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("userId", userId)
      .query<{ cnt: number }>(
        `SELECT COUNT(1) AS cnt FROM EFIELES WHERE user_id = @userId`,
      );
    return (result.recordset[0]?.cnt ?? 0) > 0;
  } catch (err) {
    console.error("[userHasEfiel] DB error:", (err as Error).message);
    return true;
  }
}
