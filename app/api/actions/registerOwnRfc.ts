'use server'

import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { uploadRfc } from './uploadRfc'

/**
 * Registra la FIEL/RFC propia del dueño de una cuenta multi.
 * Llama a uploadRfc (guarda en Blob + EFIELES) y además copia el RFC a users.rfc.
 */
export async function registerOwnRfc(formData: FormData): Promise<{ success: boolean; message: string }> {
  const result = await uploadRfc(formData)
  if (!result.success) return result

  const rfc = (formData.get('rfc') as string | null)?.trim().toUpperCase() ?? ''

  try {
    const session = await getSession()
    if (session) {
      const effectiveId = session.ownerId ?? session.sub
      const db = await getDb()
      await db
        .request()
        .input('id', effectiveId)
        .input('rfc', rfc)
        .query('UPDATE users SET rfc = @rfc WHERE id = @id AND rfc IS NULL')
    }
  } catch (err) {
    console.error('[registerOwnRfc] users.rfc update error:', (err as Error).message)
  }

  return result
}
