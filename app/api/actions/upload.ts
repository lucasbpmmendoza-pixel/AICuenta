'use server'

import { put } from '@vercel/blob'
import path from 'path'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'

const RFC_SAFE = /^[A-Za-z0-9_\-]{1,50}$/

export async function uploadFiles(formData: FormData): Promise<{ success: boolean; message: string }> {
  const session = await getSession()
  if (!session) {
    return { success: false, message: 'Sesion expirada. Vuelve a iniciar sesion.' }
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
    return { success: false, message: 'El archivo CER debe tener extension .cer' }
  }

  if (keyExt !== '.key') {
    return { success: false, message: 'El archivo KEY debe tener extension .key' }
  }

  // Sanitize filenames (keep only safe characters)
  const safeCerName = cerFile.name.replace(/[^A-Za-z0-9_\-\.]/g, '_')
  const safeKeyName = keyFile.name.replace(/[^A-Za-z0-9_\-\.]/g, '_')

  await put(`${rfc}/${safeCerName}`, cerFile, { access: 'private', allowOverwrite: true })
  await put(`${rfc}/${safeKeyName}`, keyFile, { access: 'private', allowOverwrite: true })
  await put(`${rfc}/efiel.txt`, efiel, { access: 'private', contentType: 'text/plain', allowOverwrite: true })

  // Registrar / actualizar en tabla EFIELES (UPSERT por user_id + rfc)
  try {
    const db = await getDb()
    await db
      .request()
      .input('user_id', session.sub)
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
