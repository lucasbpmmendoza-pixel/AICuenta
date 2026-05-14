'use strict';

require('dotenv').config();

const sql  = require('mssql');
const cron = require('node-cron');

// ─── Config ──────────────────────────────────────────────────────────────────

const dbConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  connectionTimeout: 60_000,
  requestTimeout:    60_000,
  pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Inserta una notificación para el usuario dado.
 * Si ya existe una notificación con el mismo body para ese usuario hoy,
 * no se duplica (dedup por ejecución horaria).
 */
async function insertNotification(pool, { userId, title, body, type = 'warning', link = null }) {
  await pool
    .request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('title',   sql.NVarChar(200),    title)
    .input('body',    sql.NVarChar(1000),   body ?? null)
    .input('type',    sql.NVarChar(20),     type)
    .input('link',    sql.NVarChar(500),    link ?? null)
    .query(`
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT @user_id, @title, @body, @type, @link
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = @user_id
          AND body     = @body
          AND CAST(created_at AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
      )
    `);
}

// ─── Verificación ─────────────────────────────────────────────────────────────

async function verificarFacturasVsBlacklist() {
  console.log('[WORKER] Iniciando verificación SAT 69-B…');

  let pool;
  try {
    pool = await sql.connect(dbConfig);

    // 1. Lista negra SAT 69-B
    const blacklistRes = await pool.request().query(`
      SELECT DISTINCT rfc FROM sat_69b_rfc
    `);
    const rfcsNegros = new Set(blacklistRes.recordset.map((r) => r.rfc.trim().toUpperCase()));

    if (rfcsNegros.size === 0) {
      console.log('[WORKER] La tabla sat_69b_rfc está vacía. Nada que verificar.');
      return;
    }

    // 2. Facturas del día anterior
    const facturasRes = await pool.request().query(`
      SELECT uuid, rfc_emisor, rfc_receptor, fecha, total
      FROM   facturalo_cfdis
      WHERE  CAST(fecha AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
    `);

    if (facturasRes.recordset.length === 0) {
      console.log('[WORKER] No hay facturas del día anterior para verificar.');
      return;
    }

    // 3. Filtrar coincidencias y recolectar RFCs afectados únicos
    const coincidencias = [];
    const rfcsAfectadosUnicos = new Set();

    for (const f of facturasRes.recordset) {
      const emisor   = (f.rfc_emisor   || '').trim().toUpperCase();
      const receptor = (f.rfc_receptor || '').trim().toUpperCase();
      const enLista  = rfcsNegros.has(emisor) || rfcsNegros.has(receptor);

      if (!enLista) continue;

      const alertas = [];
      if (rfcsNegros.has(emisor))   { alertas.push(`emisor ${emisor}`);   rfcsAfectadosUnicos.add(emisor); }
      if (rfcsNegros.has(receptor)) { alertas.push(`receptor ${receptor}`); rfcsAfectadosUnicos.add(receptor); }

      coincidencias.push({
        uuid:    f.uuid,
        fecha:   f.fecha ? new Date(f.fecha).toISOString().split('T')[0] : 'N/A',
        total:   Number(f.total ?? 0).toFixed(2),
        alertas,
        rfcEmisor:   emisor,
        rfcReceptor: receptor,
      });
    }

    if (coincidencias.length === 0) {
      console.log('[WORKER] Sin coincidencias con SAT 69-B. Todo limpio.');
      return;
    }

    console.log(`[WORKER] ⚠️  ${coincidencias.length} coincidencia(s) encontrada(s). Notificando usuarios…`);

    // 4. Obtener usuarios registrados para los RFCs afectados (una sola query)
    const rfcList = [...rfcsAfectadosUnicos].map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
    const efielesRes = await pool.request().query(`
      SELECT user_id, rfc FROM EFIELES WHERE rfc IN (${rfcList})
    `);

    // RFC → [user_id, …]
    const rfcToUsers = new Map();
    for (const row of efielesRes.recordset) {
      const rfc = row.rfc.trim().toUpperCase();
      if (!rfcToUsers.has(rfc)) rfcToUsers.set(rfc, []);
      rfcToUsers.get(rfc).push(row.user_id);
    }

    // 5. Agrupar coincidencias por usuario
    const userGroups = new Map(); // userId → [coincidencia, …]
    for (const c of coincidencias) {
      const rfcsUsuario = new Set([
        ...(rfcToUsers.get(c.rfcEmisor)   || []).map(() => c.rfcEmisor),
        ...(rfcToUsers.get(c.rfcReceptor) || []).map(() => c.rfcReceptor),
      ]);
      // Obtener user_ids reales para este CFDI
      const userIds = new Set([
        ...(rfcToUsers.get(c.rfcEmisor)   || []),
        ...(rfcToUsers.get(c.rfcReceptor) || []),
      ]);
      for (const uid of userIds) {
        if (!userGroups.has(uid)) userGroups.set(uid, []);
        userGroups.get(uid).push(c);
      }
    }

    if (userGroups.size === 0) {
      console.log('[WORKER] Coincidencias encontradas pero ningún RFC está registrado en EFIELES.');
      return;
    }

    // 6. Insertar una notificación por usuario
    let insertadas = 0;
    for (const [userId, items] of userGroups) {
      const title = `⚠️ Alerta SAT 69-B — ${items.length} factura(s) en lista negra`;

      // Body: hasta 3 facturas detalladas + resumen si hay más (máx. 1000 chars)
      const detalle = items.slice(0, 3).map((c) =>
        `UUID ${c.uuid} (${c.fecha}): ${c.alertas.join(', ')} — $${c.total}`
      );
      if (items.length > 3) detalle.push(`…y ${items.length - 3} más.`);
      const body = detalle.join(' | ');

      await insertNotification(pool, {
        userId,
        title,
        body: body.slice(0, 1000),
        type: 'warning',
        link: '/dashboard/facturas',
      });
      insertadas++;
    }

    console.log(`[WORKER] ✅ ${insertadas} notificación(es) insertada(s) en la BD.`);
  } catch (err) {
    console.error('[WORKER] Error durante la verificación:', err.message);
  } finally {
    if (pool) await pool.close();
  }
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

// Ejecuta la verificación cada hora (al minuto 0 de cada hora)
cron.schedule('0 * * * *', async () => {
  const ahora = new Date();
  console.log(`[CRON] ${ahora.toLocaleTimeString('es-MX')} — iniciando verificación SAT 69-B…`);
  await verificarFacturasVsBlacklist();
  console.log('[CRON] Verificación terminada. En espera hasta la próxima hora.');
});

// ─── Arranque ────────────────────────────────────────────────────────────────

(async () => {
  console.log('[WORKER] Arrancando worker SAT 69-B…');
  await verificarFacturasVsBlacklist();
  console.log('[WORKER] Verificación inicial completa. El cron revisará cada hora.');
})();