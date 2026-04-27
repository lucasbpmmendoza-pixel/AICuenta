'use server'

import { put } from '@vercel/blob'
import path from 'path'

const RFC_SAFE = /^[A-Za-z0-9_\-]{1,50}$/

export async function uploadFiles(formData: FormData): Promise<{ success: boolean; message: string }> {
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

  await put(`${rfc}/${safeCerName}`, cerFile, { access: 'private' })
  await put(`${rfc}/${safeKeyName}`, keyFile, { access: 'private' })
  await put(`${rfc}/efiel.txt`, efiel, { access: 'private', contentType: 'text/plain' })

  return { success: true, message: `Archivos guardados en Blob bajo ${rfc}/` }
}
