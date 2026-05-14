/**
 * Diagnóstico de fetchEstadosFinancieros contra Azure SQL
 * node scripts/diag-estados-financieros.js DGM880621FU5 2026 5
 */
const sql = require('mssql');

const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433,
  options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 300_000,
};

const rfc   = process.argv[2] || 'DGM880621FU5';
const year  = parseInt(process.argv[3] || '2026');
const month = parseInt(process.argv[4] || '5');
const dateFrom = new Date(year, month - 1, 1);
const dateTo   = new Date(year, month,     1);

console.log(`\nDiag estados-financieros: RFC=${rfc} ${year}-${String(month).padStart(2,'0')}`);
console.log(`dateFrom=${dateFrom.toISOString()}  dateTo=${dateTo.toISOString()}\n`);

async function time(label, fn) {
  const t = Date.now();
  try {
    const result = await fn();
    console.log(`[OK  ${Date.now()-t}ms] ${label}`);
    return result;
  } catch(e) {
    console.log(`[ERR ${Date.now()-t}ms] ${label}: ${e.message}`);
    return null;
  }
}

sql.connect(cfg).then(async pool => {

  // ── 0. ¿Existen los índices que creamos? ──────────────────────────────────
  await time('0. Check índices existentes', async () => {
    const r = await pool.request().query(`
      SELECT i.name, OBJECT_NAME(i.object_id) AS tabla, i.type_desc
      FROM sys.indexes i
      WHERE i.name IN (
        'IX_conceptos_rfc_mov_fecha',
        'IX_conceptos_uuid',
        'IX_cfdis_receptor_tipo_status_fecha',
        'IX_cfdis_emisor_tipo_fecha'
      )
      ORDER BY tabla, i.name
    `);
    if (r.recordset.length === 0) {
      console.log('  ⚠️  NINGÚN índice encontrado — ejecutar sql/add_conceptos_indexes.sql');
    } else {
      r.recordset.forEach(x => console.log(`  ✓ ${x.tabla}.${x.name}`));
      if (r.recordset.length < 4) console.log('  ⚠️  Faltan índices — ejecutar sql/add_conceptos_indexes.sql');
    }
  });

  // ── 1. Conteo rápido en cfdis ─────────────────────────────────────────────
  await time('1. COUNT cfdis emisor en rango', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`SELECT COUNT(*) AS cnt FROM facturalo_cfdis WITH (NOLOCK)
              WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
                AND Fecha>=@dateFrom AND Fecha<@dateTo`);
    console.log('  emisor I en rango:', r.recordset[0].cnt);
  });

  await time('2. COUNT cfdis receptor en rango', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`SELECT COUNT(*) AS cnt FROM facturalo_cfdis WITH (NOLOCK)
              WHERE RFC_Receptor=@rfc AND TipoComprobante='I' AND Status='Vigente'
                AND Fecha>=@dateFrom AND Fecha<@dateTo`);
    console.log('  receptor I Vigente en rango:', r.recordset[0].cnt);
  });

  // ── 2. Conteo en conceptos ────────────────────────────────────────────────
  await time('3. COUNT conceptos rfc_cliente total (sin rango)', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .query(`SELECT COUNT(*) AS cnt FROM facturalo_conceptos WITH (NOLOCK)
              WHERE rfc_cliente=@rfc`);
    console.log('  conceptos totales para este RFC:', r.recordset[0].cnt);
  });

  await time('4. COUNT conceptos rfc_cliente en rango', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`SELECT COUNT(*) AS cnt, COUNT(DISTINCT movimiento) AS movimientos
              FROM facturalo_conceptos WITH (NOLOCK)
              WHERE rfc_cliente=@rfc AND fecha>=@dateFrom AND fecha<@dateTo`);
    console.log('  conceptos en rango / movimientos distintos:', r.recordset[0]);
  });

  await time('5. Valores distintos de movimiento para este RFC', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .query(`SELECT TOP 20 movimiento, COUNT(*) AS cnt
              FROM facturalo_conceptos WITH (NOLOCK)
              WHERE rfc_cliente=@rfc
              GROUP BY movimiento ORDER BY cnt DESC`);
    console.log('  movimientos:', r.recordset);
  });

  // ── 3. Query ingresos (exactamente la de fetchEstadosFinancieros) ─────────
  await time('6. Q-ingresos TOP 20 (movimiento=Ingreso)', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`
        SELECT TOP 20
          ISNULL(NULLIF(c.Descripcion,''), 'Sin descripción') AS descripcion,
          ISNULL(c.ClaveProductoServicio, '')                 AS claveProdServ,
          SUM(ISNULL(c.Cantidad, 0))                         AS cantidad,
          SUM(ISNULL(c.Importe,  0))                         AS importe,
          COUNT(DISTINCT c.UUID)                             AS numFacturas
        FROM facturalo_conceptos c WITH (NOLOCK)
        WHERE c.rfc_cliente = @rfc
          AND c.movimiento  = 'Ingreso'
          AND c.fecha >= @dateFrom AND c.fecha < @dateTo
        GROUP BY c.Descripcion, c.ClaveProductoServicio
        ORDER BY SUM(ISNULL(c.Importe, 0)) DESC
        OPTION (RECOMPILE)
      `);
    console.log('  rows:', r.recordset.length, r.recordset[0] ?? '(vacío)');
  });

  // ── 4. Query egresos (INNER JOIN) ─────────────────────────────────────────
  await time('7. Q-egresos TOP 20 (INNER JOIN)', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`
        SELECT TOP 20
          ISNULL(NULLIF(c.Descripcion,''), 'Sin descripción') AS descripcion,
          ISNULL(c.ClaveProductoServicio, '')                 AS claveProdServ,
          SUM(ISNULL(c.Cantidad, 0))                         AS cantidad,
          SUM(ISNULL(c.Importe,  0))                         AS importe,
          COUNT(DISTINCT c.UUID)                             AS numFacturas
        FROM facturalo_cfdis f WITH (NOLOCK)
        INNER JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
        WHERE f.RFC_Receptor    = @rfc
          AND f.TipoComprobante = 'I'
          AND f.Status          = 'Vigente'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        GROUP BY c.Descripcion, c.ClaveProductoServicio
        ORDER BY SUM(ISNULL(c.Importe, 0)) DESC
        OPTION (RECOMPILE)
      `);
    console.log('  rows:', r.recordset.length, r.recordset[0] ?? '(vacío)');
  });

  // ── 5. Alternativa: ingresos via JOIN cfdis (no depende de movimiento) ────
  await time('8. Q-ingresos alternativa via JOIN cfdis (no usa movimiento)', async () => {
    const r = await pool.request()
      .input('rfc',      sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime,  dateFrom)
      .input('dateTo',   sql.DateTime,  dateTo)
      .query(`
        SELECT TOP 20
          ISNULL(NULLIF(c.Descripcion,''), 'Sin descripción') AS descripcion,
          ISNULL(c.ClaveProductoServicio, '')                 AS claveProdServ,
          SUM(ISNULL(c.Cantidad, 0))                         AS cantidad,
          SUM(ISNULL(c.Importe,  0))                         AS importe,
          COUNT(DISTINCT c.UUID)                             AS numFacturas
        FROM facturalo_cfdis f WITH (NOLOCK)
        INNER JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
        WHERE f.RFC_Emisor      = @rfc
          AND f.TipoComprobante = 'I'
          AND f.Status          = 'Vigente'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        GROUP BY c.Descripcion, c.ClaveProductoServicio
        ORDER BY SUM(ISNULL(c.Importe, 0)) DESC
        OPTION (RECOMPILE)
      `);
    console.log('  rows:', r.recordset.length, r.recordset[0] ?? '(vacío)');
  });

  console.log('\n── Diagnóstico completo ──\n');
  process.exit(0);

}).catch(e => { console.error('Conexión fallida:', e.message); process.exit(1); });
