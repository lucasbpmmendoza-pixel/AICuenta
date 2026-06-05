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
    return count > 0 ? "/dashboard/chat-docs" : "/upload-fiel";
  } catch (err) {
    console.error("[getPostLoginRedirect] DB error:", (err as Error).message);
    // Si falla la consulta, mandamos al dashboard por defecto
    return "/dashboard/chat-docs";
  }
}
