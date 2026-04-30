/**
 * Descargador de carpetas RFC desde Vercel Blob
 * - Consulta la tabla EFIELES en Azure SQL donde descargada=0
 * - Por cada RFC pendiente, descarga la carpeta {rfc}/ desde Vercel Blob
 * - Al terminar exitosamente marca descargada=1 en la BD
 * - Repite en bucle cada INTERVALO_MS milisegundos
 *
 * Uso:
 *   1. Asegurate de tener .env.local con BLOB_READ_WRITE_TOKEN y DB_*
 *   2. npm install
 *   3. node index.mjs
 */

import { list } from '@vercel/blob'
import sql from 'mssql'
import pg from 'pg'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env.local/.env desde varias ubicaciones (compatibilidad con PM2)
const envCandidates = [
  join(__dirname, '.env.local'),
  join(__dirname, '.env'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
]
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const match = line.trim().match(/^([^#=]+)=["']?([^"'\r\n]+)["']?$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
    console.log(`[ENV] Cargado desde: ${envPath}`)
    break
  }
}

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
if (!TOKEN) {
  console.error('ERROR: BLOB_READ_WRITE_TOKEN no encontrado en .env.local')
  process.exit(1)
}

const DB_CONFIG = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,           // requerido por Azure SQL
    trustServerCertificate: false
  }
}

if (!DB_CONFIG.user || !DB_CONFIG.password || !DB_CONFIG.server || !DB_CONFIG.database) {
  console.error('ERROR: Faltan variables DB_USER, DB_PASSWORD, DB_SERVER o DB_NAME en .env.local')
  process.exit(1)
}

const OUTPUT_DIR = '/home/local/scripts/AICuenta/rfc'
const INTERVALO_MS = 10000 // checa cada 10 segundos

// Conexión PostgreSQL local
const pgClient = new pg.Client({
  host:     'localhost',
  database: 'mmendoza_db',
  user:     'mmendoza',
  password: 'pato0102',
})
await pgClient.connect().catch(err => {
  console.error('[PG] Error conectando a PostgreSQL:', err.message)
  process.exit(1)
})
console.log('[PG] Conexión a PostgreSQL establecida.')

async function upsertCliente(rfc) {
  console.log(`  [PG]  Intentando insertar cliente: ${rfc}`)
  const res = await pgClient.query(
    `INSERT INTO clientes (rfc, "syncPaused", "syncStatus")
     VALUES ($1, false, 'activo')
     ON CONFLICT (rfc) DO NOTHING`,
    [rfc]
  )
  if (res.rowCount > 0) {
    console.log(`  [PG]  ✅ Cliente ${rfc} insertado correctamente (rowCount=${res.rowCount})`)
  } else {
    console.log(`  [PG]  ℹ️  Cliente ${rfc} ya existia en BD (ON CONFLICT, rowCount=0)`)
  }
}

// Descarga todos los archivos de la carpeta {rfc}/ en Vercel Blob
async function descargarCarpetaRfc(rfc) {
  const prefix = `${rfc}/`
  let cursor
  let total = 0
  let encontrados = 0

  do {
    const { blobs, cursor: nextCursor } = await list({
      token: TOKEN,
      prefix,
      cursor
    })
    cursor = nextCursor

    for (const blob of blobs) {
      encontrados++
      const localPath = join(OUTPUT_DIR, blob.pathname)
      const localDir = dirname(localPath)
      mkdirSync(localDir, { recursive: true })

      try {
        const response = await fetch(blob.url, {
          headers: { Authorization: `Bearer ${TOKEN}` }
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        writeFileSync(localPath, buffer)
        console.log(`  [OK]  ${blob.pathname}`)
        total++
      } catch (err) {
        console.error(`  [ERR] ${blob.pathname}: ${err.message}`)
      }
    }
  } while (cursor)

  return { total, encontrados }
}

async function ciclo(pool) {
  // Obtener RFCs pendientes de descarga
  const result = await pool.request()
    .query('SELECT id, rfc FROM EFIELES WHERE descargada = 0')

  const pendientes = result.recordset
  console.log(`[CHECK] Pendientes de descarga: ${pendientes.length}`)

  if (pendientes.length === 0) return

  for (const row of pendientes) {
    const { id, rfc } = row
    console.log(`[INFO] Descargando RFC: ${rfc} (id=${id})`)

    const { total, encontrados } = await descargarCarpetaRfc(rfc)

    if (encontrados === 0) {
      console.log(`  [WARN] No se encontraron archivos en Blob para ${rfc}/`)
      continue
    }

    if (total === encontrados) {
      // Marcar como descargada en la BD usando parametro para evitar inyeccion
      await pool.request()
        .input('id', id)
        .query('UPDATE EFIELES SET descargada = 1 WHERE id = @id')
      console.log(`  [BD]  RFC ${rfc} marcada como descargada=1`)

      // Insertar en clientes de PostgreSQL
      try {
        await upsertCliente(rfc)
        console.log(`  [PG]  Cliente ${rfc} insertado/verificado en PostgreSQL`)
      } catch (err) {
        console.error(`  [PG]  Error insertando cliente ${rfc}:`, err.message)
      }
    } else {
      console.log(`  [WARN] Solo ${total}/${encontrados} archivos descargados para ${rfc}, no se marca como completa`)
    }
  }
}

async function main() {
  console.log('Conectando a Azure SQL...')
  const pool = await sql.connect(DB_CONFIG)
  console.log('Conexion establecida.\n')
  console.log('Iniciando monitor de descarga de carpetas RFC...\n')

  await ciclo(pool)

  setInterval(async () => {
    try {
      await ciclo(pool)
    } catch (err) {
      console.error('[ERR] Error en ciclo:', err.message)
    }
  }, INTERVALO_MS)
}

main().catch((err) => {
  console.error('Error inesperado:', err.message)
  process.exit(1)
})