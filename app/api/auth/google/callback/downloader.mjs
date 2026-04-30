/**
 * Script independiente para descargar archivos de Vercel Blob
 * Uso: node descargar-blob.mjs
 *
 * Requiere BLOB_READ_WRITE_TOKEN en el entorno o en .env.local
 * Los archivos se guardan en: downloads/{ruta-del-blob}
 */

import { list } from '@vercel/blob'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar variables de entorno desde .env.local o .env en varias ubicaciones posibles
const envCandidates = [
  join(__dirname, '.env.local'),
  join(__dirname, '.env'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
]
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=["']?([^"'\n]+)["']?$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
    console.log(`[ENV] Cargado desde: ${envPath}`)
    break
  }
}

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
if (!TOKEN) {
  console.error('ERROR: BLOB_READ_WRITE_TOKEN no encontrado en .env.local ni en el entorno.')
  process.exit(1)
}

const OUTPUT_DIR = join(__dirname, 'downloads')

const db = new Client({
  host:     'localhost',
  database: 'mmendoza_db',
  user:     'mmendoza',
  password: 'pato0102',
})

async function upsertCliente(rfc) {
  await db.query(
    `INSERT INTO clientes (rfc, "syncPaused", "syncStatus")
     VALUES ($1, false, 'activo')
     ON CONFLICT (rfc) DO NOTHING`,
    [rfc]
  )
}

async function main() {
  await db.connect()
  console.log('Listando archivos en Vercel Blob...\n')

  let cursor
  let total = 0
  const insertedRfcs = new Set()

  do {
    const { blobs, cursor: nextCursor } = await list({ token: TOKEN, cursor })
    cursor = nextCursor

    for (const blob of blobs) {
      const relativePath = new URL(blob.pathname).pathname.replace(/^\//, '') || blob.pathname
      const localPath = join(OUTPUT_DIR, blob.pathname)
      const localDir = dirname(localPath)

      mkdirSync(localDir, { recursive: true })

      try {
        const response = await fetch(blob.url, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        })
        const buffer = Buffer.from(await response.arrayBuffer())
        writeFileSync(localPath, buffer)
        console.log(`[OK]  ${blob.pathname}  ->  downloads/${blob.pathname}`)
        total++

        // Extraer RFC del primer segmento del path (ej. "BOAA950125JSA/archivo.cer")
        const rfc = blob.pathname.split('/')[0]
        if (rfc && !insertedRfcs.has(rfc)) {
          await upsertCliente(rfc)
          insertedRfcs.add(rfc)
          console.log(`[DB]  Cliente insertado: ${rfc}`)
        }
      } catch (err) {
        console.error(`[ERR] ${blob.pathname}: ${err.message}`)
      }
    }
  } while (cursor)

  await db.end()
  console.log(`\nDescarga completada. ${total} archivo(s) guardado(s) en downloads/`)
  if (insertedRfcs.size > 0) {
    console.log(`Clientes insertados en BD: ${[...insertedRfcs].join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err.message)
  process.exit(1)
})