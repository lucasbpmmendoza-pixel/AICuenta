/**
 * whatsapp-manager.ts
 * Singleton Baileys session manager — one WhatsApp connection per owner account.
 * Uses globalThis to survive Next.js HMR reloads in development.
 */
import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys'
import path from 'path'
import fs from 'fs'
import QRCode from 'qrcode'
import { OpenAI } from 'openai'
import { getDb } from './db'
import sql from 'mssql'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

export type WAEvent =
  | { type: 'qr'; dataUrl: string }
  | { type: 'status'; status: ConnectionStatus }

interface WASession {
  ownerId: string
  status: ConnectionStatus
  qrDataUrl: string | null
  sock: ReturnType<typeof makeWASocket> | null
  listeners: Set<(event: WAEvent) => void>
}

// ── Global singleton ──────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __waSessionMap: Map<string, WASession> | undefined
}

function getSessions(): Map<string, WASession> {
  if (!global.__waSessionMap) {
    global.__waSessionMap = new Map()
  }
  return global.__waSessionMap
}

function getOrCreate(ownerId: string): WASession {
  const map = getSessions()
  if (!map.has(ownerId)) {
    map.set(ownerId, {
      ownerId,
      status: 'disconnected',
      qrDataUrl: null,
      sock: null,
      listeners: new Set(),
    })
  }
  return map.get(ownerId)!
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthDir(ownerId: string): string {
  const dir = path.join(process.cwd(), 'tmp', 'whatsapp_auth', ownerId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function emit(session: WASession, event: WAEvent) {
  session.listeners.forEach((l) => {
    try { l(event) } catch { /* ignore listener errors */ }
  })
}

function extractImageMessage(msg: WAMessage['message']): unknown | null {
  if (!msg) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = msg as any
  if (m.imageMessage) return m.imageMessage
  if (m.ephemeralMessage) return extractImageMessage(m.ephemeralMessage.message)
  if (m.viewOnceMessageV2) return extractImageMessage(m.viewOnceMessageV2.message)
  if (m.viewOnceMessageV2Extension) return extractImageMessage(m.viewOnceMessageV2Extension.message)
  if (m.viewOnceMessage) return extractImageMessage(m.viewOnceMessage.message)
  return null
}

async function downloadImageBuffer(imageMessage: unknown): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await downloadContentFromMessage(imageMessage as any, 'image')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

// ── OpenAI helpers ────────────────────────────────────────────────────────────

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

async function esComprobante(base64: string): Promise<boolean> {
  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '¿La imagen corresponde a un comprobante de pago, transferencia bancaria o recibo de transacción? Responde solo "Sí" o "No".' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ],
    }],
    max_tokens: 10,
  })
  return res.choices[0].message.content?.trim().toLowerCase().startsWith('sí') ?? false
}

async function extraerDatos(base64: string): Promise<Record<string, string | null>> {
  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analiza esta imagen de un comprobante de pago y responde SOLO un JSON válido (sin backticks) con estos campos:
banco, fecha, monto, folio, beneficiario,
cuenta_destino (solo últimos 4 dígitos), referencia, concepto, clave_rastreo.
Si algún dato no se encuentra usa null.`,
        },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ],
    }],
    max_tokens: 500,
  })
  try {
    return JSON.parse(res.choices[0].message.content ?? '{}')
  } catch {
    return {}
  }
}

async function formatearFecha(fecha: string | null): Promise<string> {
  if (!fecha) return ''
  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Convierte la siguiente fecha al formato "dd-mm-yyyy". Responde ÚNICAMENTE con la fecha en ese formato y nada más. No uses palabras extra. Fecha: ${fecha}`,
      }],
      max_tokens: 20,
    })
    return res.choices[0].message.content?.trim() ?? fecha
  } catch { return fecha }
}

function limpiarMonto(m: string | number | null): number | null {
  if (!m) return null
  const s = m.toString().replace(/[^\d.]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ── DB save ───────────────────────────────────────────────────────────────────

async function guardarComprobante(ownerId: string, datos: Record<string, string | number | null>) {
  const db = await getDb()
  await db.request()
    .input('owner_id',           sql.NVarChar,      ownerId)
    .input('remitente_nombre',   sql.NVarChar,      (datos.remitente_nombre   as string) ?? null)
    .input('remitente_telefono', sql.NVarChar,      (datos.remitente_telefono as string) ?? null)
    .input('banco',              sql.NVarChar,      (datos.banco              as string) ?? null)
    .input('fecha',              sql.NVarChar,      (datos.fecha              as string) ?? null)
    .input('monto',              sql.Decimal(18, 2),limpiarMonto(datos.monto as string))
    .input('folio',              sql.NVarChar,      (datos.folio              as string) ?? null)
    .input('concepto',           sql.NVarChar,      (datos.concepto           as string) ?? null)
    .input('referencia',         sql.NVarChar,      (datos.referencia         as string) ?? null)
    .input('clave_rastreo',      sql.NVarChar,      (datos.clave_rastreo      as string) ?? null)
    .input('beneficiario',       sql.NVarChar,      (datos.beneficiario       as string) ?? null)
    .input('cuenta_destino',     sql.NVarChar,      (datos.cuenta_destino     as string) ?? null)
    .input('fuente',             sql.NVarChar,      'WhatsApp')
    .query(`
      INSERT INTO dbo.Comprobantes
        (owner_id, remitente_nombre, remitente_telefono, banco, fecha, monto,
         folio, concepto, referencia, clave_rastreo, beneficiario, cuenta_destino, Fuente)
      VALUES
        (@owner_id, @remitente_nombre, @remitente_telefono, @banco, @fecha, @monto,
         @folio, @concepto, @referencia, @clave_rastreo, @beneficiario, @cuenta_destino, @fuente)
    `)
}

// ── Message processor ─────────────────────────────────────────────────────────

async function procesarMensaje(session: WASession, message: WAMessage) {
  const remoteJid = message.key.remoteJid
  if (!remoteJid || message.key.fromMe) return
  if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return

  const imageMessage = extractImageMessage(message.message)
  if (!imageMessage) return

  const imgBuffer = await downloadImageBuffer(imageMessage)
  const base64 = imgBuffer.toString('base64')

  const valido = await esComprobante(base64)
  if (!valido) return

  const datos = await extraerDatos(base64)
  const remitenteJid = message.key.participant || message.key.remoteJid || ''
  datos.remitente_nombre = message.pushName ?? 'desconocido'
  datos.remitente_telefono = remitenteJid.split('@')[0] ?? 'desconocido'
  datos.fecha = await formatearFecha(datos.fecha ?? null)

  await guardarComprobante(session.ownerId, datos)

  if (session.sock) {
    await session.sock.sendMessage(
      remoteJid,
      { text: '✅ Muchas gracias. El comprobante ha sido registrado exitosamente en el sistema.' },
      { quoted: message },
    )
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startSession(ownerId: string): Promise<void> {
  const session = getOrCreate(ownerId)
  if (session.status === 'connected' || session.status === 'connecting') return

  session.status = 'connecting'
  emit(session, { type: 'status', status: 'connecting' })

  const authDir = getAuthDir(ownerId)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    browser: ['AICuenta Bot', 'Chrome', '1.0.0'],
  })

  session.sock = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr)
      session.qrDataUrl = dataUrl
      session.status = 'qr'
      emit(session, { type: 'qr', dataUrl })
      emit(session, { type: 'status', status: 'qr' })
    }

    if (connection === 'open') {
      session.status = 'connected'
      session.qrDataUrl = null
      emit(session, { type: 'status', status: 'connected' })
    }

    if (connection === 'close') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut
      session.status = 'disconnected'
      session.sock = null
      emit(session, { type: 'status', status: 'disconnected' })

      if (!loggedOut) {
        // Auto-reconnect after brief delay
        setTimeout(() => startSession(ownerId).catch(console.error), 4000)
      } else {
        // Clear saved credentials on explicit logout
        fs.rmSync(getAuthDir(ownerId), { recursive: true, force: true })
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      try {
        await procesarMensaje(session, message)
      } catch (err) {
        console.error('[WA] Error procesando mensaje:', err)
      }
    }
  })
}

export function subscribe(ownerId: string, listener: (event: WAEvent) => void): () => void {
  const session = getOrCreate(ownerId)
  session.listeners.add(listener)
  return () => session.listeners.delete(listener)
}

export function getStatus(ownerId: string): { status: ConnectionStatus; qrDataUrl: string | null } {
  const session = getSessions().get(ownerId)
  if (!session) return { status: 'disconnected', qrDataUrl: null }
  return { status: session.status, qrDataUrl: session.qrDataUrl }
}

export async function disconnectSession(ownerId: string): Promise<void> {
  const session = getSessions().get(ownerId)
  if (!session) return

  if (session.sock) {
    try { await session.sock.logout() } catch { /* ignore */ }
    session.sock = null
  }

  session.status = 'disconnected'
  session.qrDataUrl = null
  emit(session, { type: 'status', status: 'disconnected' })

  const authDir = path.join(process.cwd(), 'tmp', 'whatsapp_auth', ownerId)
  fs.rmSync(authDir, { recursive: true, force: true })
}
