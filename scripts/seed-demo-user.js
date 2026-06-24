/**
 * Crea (o reusa) el usuario lifsa@gmail.com para grabar el video demo.
 *
 *   node scripts/seed-demo-user.js
 *
 * - Inserta el usuario con email_verified=1 y plan_type='basic'
 * - Hash bcrypt de la contrasena (12 rounds, igual que /api/auth/register)
 * - Inserta una EFIEL placeholder para que el login no caiga en /upload-fiel
 *
 * Idempotente: si ya existe el usuario o la EFIEL, no duplica nada.
 */

const sql = require('mssql');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Parse .env manually (no dotenv en el proyecto)
const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
envText.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([^#=]+)=(.+)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const EMAIL = 'lifsa@gmail.com';
const NAME = 'LIFSA Demo';
const PASSWORD = 'lifsa1234';
const DEMO_RFC = 'LIFS010101AAA';
const DEMO_ALIAS = 'LIFSA Demo';
const DEMO_FIEL = 'demo-fiel-placeholder';
const BCRYPT_ROUNDS = 12;

const cfg = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  port: Number(process.env.AZURE_SQL_PORT || 1433),
  options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  connectionTimeout: 30_000,
  requestTimeout: 60_000,
};

(async () => {
  const pool = await sql.connect(cfg);

  // ── 1. Insertar o leer usuario ─────────────────────────────
  const existing = await pool.request()
    .input('email', sql.NVarChar, EMAIL)
    .query('SELECT id, email_verified FROM users WHERE email = @email');

  let userId;

  if (existing.recordset.length > 0) {
    userId = existing.recordset[0].id;
    console.log(`[users] Ya existe ${EMAIL} -> id ${userId}`);

    const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    await pool.request()
      .input('id', sql.UniqueIdentifier, userId)
      .input('hash', sql.NVarChar, hash)
      .query(`UPDATE users
              SET password_hash = @hash,
                  email_verified = 1,
                  is_active = 1
              WHERE id = @id`);
    console.log(`[users] Password reseteado a "${PASSWORD}" y email_verified=1`);
  } else {
    const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    const inserted = await pool.request()
      .input('name', sql.NVarChar, NAME)
      .input('email', sql.NVarChar, EMAIL)
      .input('hash', sql.NVarChar, hash)
      .query(`INSERT INTO users (name, email, password_hash, plan_type, email_verified, is_active)
              OUTPUT INSERTED.id
              VALUES (@name, @email, @hash, 'basic', 1, 1)`);
    userId = inserted.recordset[0].id;
    console.log(`[users] Creado ${EMAIL} -> id ${userId}`);
  }

  // ── 2. Insertar EFIEL placeholder (salta /upload-fiel) ─────
  const efielExists = await pool.request()
    .input('user_id', sql.UniqueIdentifier, userId)
    .input('rfc', sql.NVarChar, DEMO_RFC)
    .query('SELECT id FROM EFIELES WHERE user_id = @user_id AND rfc = @rfc');

  if (efielExists.recordset.length > 0) {
    console.log(`[efieles] Ya existe RFC ${DEMO_RFC} para este usuario`);
  } else {
    await pool.request()
      .input('user_id', sql.UniqueIdentifier, userId)
      .input('rfc', sql.NVarChar, DEMO_RFC)
      .input('fiel', sql.NVarChar, DEMO_FIEL)
      .input('alias', sql.NVarChar, DEMO_ALIAS)
      .query(`INSERT INTO EFIELES (user_id, rfc, fiel, alias, downloads_enabled)
              VALUES (@user_id, @rfc, @fiel, @alias, 0)`);
    console.log(`[efieles] EFIEL placeholder agregada para RFC ${DEMO_RFC}`);
  }

  console.log('\n========================================');
  console.log('LISTO. Credenciales para el video:');
  console.log('  URL:        http://localhost:3000/login');
  console.log(`  Email:      ${EMAIL}`);
  console.log(`  Password:   ${PASSWORD}`);
  console.log(`  RFC demo:   ${DEMO_RFC}`);
  console.log('========================================');
  console.log('\nNota: los paneles de CFDIs (facturalo_cfdis) se llenan');
  console.log('con la descarga real del SAT, no por esta seed. El chat-docs,');
  console.log('configuracion, soporte y onboarding si son grabables.');

  await pool.close();
})().catch((err) => {
  console.error('[seed-demo-user] ERROR:', err.message);
  process.exit(1);
});
