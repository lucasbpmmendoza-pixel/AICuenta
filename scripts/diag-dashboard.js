/**
 * Diagnóstico de las queries del dashboard directamente contra Azure SQL
 * node scripts/diag-dashboard.js AARA7911189MA 2026 4
 */
const sql = require('mssql');

const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 120_000,
};

const rfc   = process.argv[2] || 'AARA7911189MA';
const year  = parseInt(process.argv[3] || '2026');
const month = parseInt(process.argv[4] || '4');
const dateFrom = new Date(year, month - 1, 1);
const dateTo   = new Date(year, month, 1);

console.log(`\nDiagnóstico: RFC=${rfc} ${year}-${String(month).padStart(2,'0')}`);
console.log(`dateFrom=${dateFrom.toISOString()} dateTo=${dateTo.toISOString()}\n`);

async function time(label, fn) {
  const t = Date.now();
  try {
    const result = await fn();
    console.log(`[OK ${Date.now()-t}ms] ${label}`);
    return result;
  } catch(e) {
    console.log(`[ERR ${Date.now()-t}ms] ${label}: ${e.message}`);
    return null;
  }
}

sql.connect(cfg).then(async pool => {

  // Valores distintos de movimiento en conceptos
  await time('movimiento values en conceptos', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .query("SELECT DISTINCT movimiento FROM facturalo_conceptos WITH (NOLOCK) WHERE rfc_cliente=@rfc");
    console.log('  movimiento values:', r.recordset.map(x=>x.movimiento));
  });

  // ¿Existen datos en el rango?
  await time('count cfdis en rango', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`SELECT COUNT(*) AS cnt FROM facturalo_cfdis WITH (NOLOCK) WHERE RFC_Emisor=@rfc AND Fecha>=@dateFrom AND Fecha<@dateTo`);
    console.log('  cfdis emisor en rango:', r.recordset[0].cnt);
  });

  // Query 1: ingresos summary
  await time('Q1 ingresos summary', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total ELSE 0 END),0) AS total,
          COUNT(*) AS count,
          SUM(CASE WHEN Status='Vigente'  THEN 1 ELSE 0 END) AS vigentes,
          SUM(CASE WHEN Status!='Vigente' THEN 1 ELSE 0 END) AS cancelados
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
      `);
    console.log('  result:', r.recordset[0]);
  });

  // Query 2: egresos summary
  await time('Q2 egresos summary', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total ELSE 0 END),0) AS total, COUNT(*) AS count
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
      `);
    console.log('  result:', r.recordset[0]);
  });

  // Query 3: top clientes
  await time('Q3 top clientes', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 ISNULL(NULLIF(RazonSocialReceptor,''), RFC_Receptor) AS nombre, SUM(Total) AS monto
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Emisor=@rfc AND TipoComprobante='I' AND Status='Vigente'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
        GROUP BY RazonSocialReceptor, RFC_Receptor ORDER BY SUM(Total) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  // Query 4: top proveedores
  await time('Q4 top proveedores', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 ISNULL(NULLIF(RazonSocialEmisor,''), RFC_Emisor) AS nombre, SUM(Total) AS monto
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Receptor=@rfc AND TipoComprobante='I' AND Status='Vigente'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
        GROUP BY RazonSocialEmisor, RFC_Emisor ORDER BY SUM(Total) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  // Query 5: conceptos ingresos (sin JOIN)
  await time('Q5 conceptos ingresos (sin JOIN, movimiento=Ingreso)', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 Descripcion AS concepto, SUM(Importe) AS monto
        FROM facturalo_conceptos WITH (NOLOCK)
        WHERE rfc_cliente=@rfc AND movimiento='Ingreso'
          AND fecha>=@dateFrom AND fecha<@dateTo
        GROUP BY Descripcion ORDER BY SUM(Importe) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  // Query 5b: probar con movimiento en minúscula
  await time('Q5b conceptos ingresos (movimiento=ingreso lowercase)', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 Descripcion AS concepto, SUM(Importe) AS monto
        FROM facturalo_conceptos WITH (NOLOCK)
        WHERE rfc_cliente=@rfc AND LOWER(movimiento)='ingreso'
          AND fecha>=@dateFrom AND fecha<@dateTo
        GROUP BY Descripcion ORDER BY SUM(Importe) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  // Query 6: conceptos egresos (con JOIN)
  await time('Q6 conceptos egresos (con JOIN)', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 c.Descripcion AS concepto, SUM(c.Importe) AS monto
        FROM facturalo_conceptos c WITH (NOLOCK)
        JOIN facturalo_cfdis f WITH (NOLOCK) ON c.UUID=f.UUID
        WHERE f.RFC_Receptor=@rfc AND f.TipoComprobante='I' AND f.Status='Vigente'
          AND f.Fecha>=@dateFrom AND f.Fecha<@dateTo
        GROUP BY c.Descripcion ORDER BY SUM(c.Importe) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  // Query 6b: conceptos egresos alternativo (usando rfc_cliente en conceptos directo)
  await time('Q6b conceptos egresos (LOWER movimiento=egreso)', async () => {
    const r = await pool.request()
      .input('rfc', sql.NVarChar, rfc)
      .input('dateFrom', sql.DateTime, dateFrom)
      .input('dateTo',   sql.DateTime, dateTo)
      .query(`
        SELECT TOP 5 Descripcion AS concepto, SUM(Importe) AS monto
        FROM facturalo_conceptos WITH (NOLOCK)
        WHERE rfc_cliente=@rfc AND LOWER(movimiento) IN ('egreso','egresos')
          AND fecha>=@dateFrom AND fecha<@dateTo
        GROUP BY Descripcion ORDER BY SUM(Importe) DESC
      `);
    console.log('  rows:', r.recordset.length);
  });

  console.log('\nDiagnóstico completo.');
  process.exit(0);
}).catch(e => { console.error('Connection error:', e.message); process.exit(1); });
