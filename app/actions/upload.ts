'use server'

import fs from 'fs'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const ALLOWED_EXTENSIONS = ['.cer', '.key']
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

  // Construct target path and verify it stays within UPLOADS_DIR (anti path traversal)
  const rfcDir = path.resolve(UPLOADS_DIR, rfc)
  if (!rfcDir.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    return { success: false, message: 'RFC no valido.' }
  }

  fs.mkdirSync(rfcDir, { recursive: true })

  const cerBuffer = Buffer.from(await cerFile.arrayBuffer())
  const keyBuffer = Buffer.from(await keyFile.arrayBuffer())

  // Sanitize original filenames (keep only safe characters)
  const safeCerName = path.basename(cerFile.name.replace(/[^A-Za-z0-9_\-\.]/g, '_'))
  const safeKeyName = path.basename(keyFile.name.replace(/[^A-Za-z0-9_\-\.]/g, '_'))

  fs.writeFileSync(path.join(rfcDir, safeCerName), cerBuffer)
  fs.writeFileSync(path.join(rfcDir, safeKeyName), keyBuffer)
  fs.writeFileSync(path.join(rfcDir, 'efiel.txt'), efiel, 'utf8')

  return { success: true, message: `Archivos guardados en uploads/${rfc}/` }
}
