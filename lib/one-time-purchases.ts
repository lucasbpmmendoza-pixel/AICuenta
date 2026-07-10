import type sql from "mssql";

/**
 * Compras one-time (Stripe mode=payment).
 *
 * Modelo derivado: la disponibilidad de una compra se calcula consultando
 * `AIC_compras_unicas` (ver sql/create_AIC_compras_unicas.sql), sin flags en users.
 * Fail-open igual que lib/freemium.ts: si la tabla no existe (entorno viejo)
 * los helpers devuelven "no disponible" (no rompen render).
 *
 * Precios: el catalogo vive en la tabla `AIC_productos_one_time` (ver
 * sql/create_AIC_productos_one_time.sql), analogo a `plans` pero para pagos
 * unicos. Solo 2 filas fijas: 'cuadro_download' y 'comparar_auditar_mes'.
 */

export type OneTimeTipo = "cuadro_download" | "comparar_auditar_mes";

export const ONE_TIME_TIPOS: readonly OneTimeTipo[] = [
  "cuadro_download",
  "comparar_auditar_mes",
] as const;

export function isOneTimeTipo(v: unknown): v is OneTimeTipo {
  return typeof v === "string" && (ONE_TIME_TIPOS as readonly string[]).includes(v);
}

export interface OneTimePricing {
  priceId: string;
  amountCents: number;   // Stripe usa centavos; 5000 = 50 MXN
  label: string;
}

/**
 * Lee del catalogo `AIC_productos_one_time` el precio activo para un tipo dado.
 * Devuelve null si no hay fila activa o si `stripe_price_id` esta vacio (paso
 * de setup pendiente); el endpoint que llama debe devolver un error legible.
 */
export async function getOneTimePricing(
  db: sql.ConnectionPool,
  tipo: OneTimeTipo,
): Promise<OneTimePricing | null> {
  try {
    const r = await db
      .request()
      .input("tipo", tipo)
      .query<{ stripe_price_id: string | null; monto_centavos: number; nombre: string }>(`
        SELECT TOP 1 stripe_price_id, monto_centavos, nombre
        FROM AIC_productos_one_time WITH (NOLOCK)
        WHERE tipo = @tipo AND es_activo = 1
      `);
    const row = r.recordset[0];
    if (!row || !row.stripe_price_id) return null;
    return {
      priceId: row.stripe_price_id,
      amountCents: row.monto_centavos,
      label: row.nombre,
    };
  } catch {
    return null;
  }
}

/** Mes calendario actual (server local; en Vercel = UTC). */
export function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * ¿Tiene el usuario una descarga de cuadro comprada y sin consumir?
 * Devuelve el id de la compra disponible, o null.
 */
export async function findAvailableCuadroDownload(
  db: sql.ConnectionPool,
  userId: string,
): Promise<number | null> {
  try {
    const r = await db
      .request()
      .input("user_id", userId)
      .query<{ id: number }>(`
        SELECT TOP 1 id
        FROM AIC_compras_unicas WITH (NOLOCK)
        WHERE user_id = @user_id
          AND tipo = 'cuadro_download'
          AND estado = 'pagada'
        ORDER BY fecha_pago ASC, id ASC
      `);
    return r.recordset[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Marca la descarga como consumida (idempotente si el id ya no esta 'pagada').
 * Devuelve true si el UPDATE afecto una fila.
 */
export async function consumeCuadroDownload(
  db: sql.ConnectionPool,
  userId: string,
  id: number,
): Promise<boolean> {
  try {
    const r = await db
      .request()
      .input("id", id)
      .input("user_id", userId)
      .query(`
        UPDATE AIC_compras_unicas
        SET estado = 'consumida', fecha_consumo = SYSUTCDATETIME()
        WHERE id = @id
          AND user_id = @user_id
          AND tipo = 'cuadro_download'
          AND estado = 'pagada'
      `);
    return (r.rowsAffected?.[0] ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * ¿Tiene el usuario un unlock activo de Comparar+Auditar para (year, month)?
 * Un unlock es una compra `pagada` de tipo 'comparar_auditar_mes' cuyo
 * periodo coincide. No se "consume" (dura todo el mes).
 */
export async function hasComparAudUnlock(
  db: sql.ConnectionPool,
  userId: string,
  year: number,
  month: number,
): Promise<boolean> {
  try {
    const r = await db
      .request()
      .input("user_id", userId)
      .input("y", year)
      .input("m", month)
      .query<{ n: number }>(`
        SELECT TOP 1 1 AS n
        FROM AIC_compras_unicas WITH (NOLOCK)
        WHERE user_id = @user_id
          AND tipo = 'comparar_auditar_mes'
          AND estado = 'pagada'
          AND periodo_year = @y
          AND periodo_month = @m
      `);
    return r.recordset.length > 0;
  } catch {
    return false;
  }
}
