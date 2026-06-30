'use server'

import path from 'path'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { loadOwnerPlanLimits } from '@/lib/account-plan'
import { uploadRfcFiles } from '@/lib/rfc-storage'

const RFC_SAFE = /^[A-Za-z0-9_\-]{1,50}$/

export async function uploadFiles(formData: FormData): Promise<{ success: boolean; message: string }> {
  const session = await getSession()
  if (!session) {
    return { success: false, message: 'Sesión expirada. Vuelve a iniciar sesión.' }
  }

  const rfc = (formData.get('rfc') as string | null)?.trim() ?? ''
  const efiel = (formData.get('efiel') as string | null)?.trim() ?? ''
  const cerFile = formData.get('cer') as File | null
  const keyFile = formData.get('key') as File | null

  if (!rfc || !efiel) {
    return { success: false, message: 'RFC y EFIEL son obligatorios.' }
  }

  if (!RFC_SAFE.test(rfc)) {
    return { success: false, message: 'RFC contiene caracteres no permitidos.' }
  }

  if (!cerFile || cerFile.size === 0) {
    return { success: false, message: 'Debes subir un archivo .CER.' }
  }

  if (!keyFile || keyFile.size === 0) {
    return { success: false, message: 'Debes subir un archivo .KEY.' }
  }

  const cerExt = path.extname(cerFile.name).toLowerCase()
  const keyExt = path.extname(keyFile.name).toLowerCase()

  if (cerExt !== '.cer') {
    return { success: false, message: 'El archivo CER debe tener extensión .cer' }
  }

  if (keyExt !== '.key') {
    return { success: false, message: 'El archivo KEY debe tener extensión .key' }
  }

  const effectiveUserId = session.ownerId ?? session.sub

  // Validar limites por plan antes de subir archivos
  try {
    const db = await getDb()
    const limits = await loadOwnerPlanLimits(db, effectiveUserId)

    const countResult = await db
      .request()
      .input('user_id', effectiveUserId)
      .input('rfc', rfc)
      .query<{ total: number; exists_rfc: number }>(`
        SELECT
          COUNT(1) AS total,
          SUM(CASE WHEN rfc = @rfc THEN 1 ELSE 0 END) AS exists_rfc
        FROM EFIELES
        WHERE user_id = @user_id
      `)

    const total = countResult.recordset[0]?.total ?? 0
    const existsRfc = (countResult.recordset[0]?.exists_rfc ?? 0) > 0
    if (!existsRfc && total >= limits.maxRfcs) {
      return {
        success: false,
        message: `Tu plan ${limits.planType} permite hasta ${limits.maxRfcs} RFC(s). Actualiza tu plan para registrar mas RFCs.`,
      }
    }
  } catch (err) {
    console.error('[uploadFiles] limit check error:', (err as Error).message)
    return { success: false, message: 'No se pudo validar el límite de RFCs. Intenta de nuevo.' }
  }

  // Subir al servicio aicuenta-storage (FastAPI en Ubuntu, reemplazo de Vercel Blob)
  try {
    await uploadRfcFiles({ rfc, efiel, cer: cerFile, key: keyFile })
  } catch (err) {
    console.error('[uploadFiles] storage error:', (err as Error).message)
    return { success: false, message: 'Error al subir los archivos. Intenta de nuevo.' }
  }

  // Registrar / actualizar en tabla EFIELES (UPSERT por user_id + rfc)
  try {
    const db = await getDb()
    await db
      .request()
      .input('user_id', effectiveUserId)
      .input('rfc', rfc)
      .input('fiel', efiel)
      .query(`
        MERGE EFIELES AS target
        USING (SELECT @user_id AS user_id, @rfc AS rfc) AS source
          ON target.user_id = source.user_id AND target.rfc = source.rfc
        WHEN MATCHED THEN
          UPDATE SET fiel = @fiel, last_update = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (user_id, rfc, fiel)
          VALUES (@user_id, @rfc, @fiel);
      `)
  } catch (err) {
    console.error('[uploadFiles] Error al guardar en EFIELES:', (err as Error).message)
    // Los archivos ya se subieron a Blob; no bloqueamos al usuario por error de BD
  }

  return { success: true, message: `Archivos guardados en Blob bajo ${rfc}/` }
}
