import sql from "mssql";
import { getDb } from "./db";

const MAX_CONTEXT_MESSAGES = 5;

export interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

function isValidRole(role: unknown): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

function parseMessages(raw: string): ContextMessage[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          typeof m === "object" &&
          isValidRole(m.role) &&
          typeof m.content === "string",
      )
      .map((m) => ({ role: m.role, content: m.content }));
  } catch {
    return [];
  }
}

export async function loadFiscalContext(
  userId: string,
  rfc: string,
): Promise<ContextMessage[]> {
  try {
    const db = await getDb();
    const res = await db
      .request()
      .input("uid", sql.UniqueIdentifier, userId)
      .input("rfc", sql.NVarChar(20), rfc)
      .query<{ messages: string }>(
        "SELECT messages FROM chat_fiscal_context WITH (NOLOCK) WHERE user_id = @uid AND rfc = @rfc",
      );

    const row = res.recordset[0];
    if (!row) return [];
    return parseMessages(row.messages);
  } catch (err) {
    // Si la tabla aún no existe o hay error de conexión, degradar silenciosamente
    console.warn("[chat-fiscal-context] loadFiscalContext error:", (err as Error).message);
    return [];
  }
}

export async function saveFiscalContext(
  userId: string,
  rfc: string,
  messages: ContextMessage[],
): Promise<void> {
  const trimmed = messages.slice(-MAX_CONTEXT_MESSAGES);
  const json = JSON.stringify(trimmed);

  try {
    const db = await getDb();
    await db
      .request()
      .input("uid", sql.UniqueIdentifier, userId)
      .input("rfc", sql.NVarChar(20), rfc)
      .input("msgs", sql.NVarChar(sql.MAX), json)
      .query(`
        MERGE chat_fiscal_context WITH (HOLDLOCK) AS target
        USING (SELECT @uid AS user_id, @rfc AS rfc) AS source
          ON target.user_id = source.user_id AND target.rfc = source.rfc
        WHEN MATCHED THEN
          UPDATE SET messages = @msgs, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (user_id, rfc, messages, updated_at)
          VALUES (@uid, @rfc, @msgs, SYSUTCDATETIME());
      `);
  } catch (err) {
    // No fallar la solicitud principal si el guardado de contexto falla
    console.warn("[chat-fiscal-context] saveFiscalContext error:", (err as Error).message);
  }
}
