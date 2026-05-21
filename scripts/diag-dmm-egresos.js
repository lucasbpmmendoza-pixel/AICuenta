const sql = require('mssql');
const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 300_000,
};

const rfc      = process.argv[2] || 'DMM180222I17';
const year     = parseInt(process.argv[3] || '2026');
const month    = parseInt(process.argv[4] || '5');
const dateFrom = new Date(Date.UTC(year, month - 1, 1));
const dateTo   = new Date(Date.UTC(year, month, 1));

console.log(`\nDiag egresos: RFC=${rfc} ${year}-${String(month).padStart(2,'0')}`);

sql.connect(cfg).then(async pool => {

  // 1. All cfdis rows matching the egreso filter
  const r1 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT f.UUID, f.Movimiento, f.TipoComprobante, f.RFC_Emisor, f.RFC_Receptor, f.Subtotal
      FROM facturalo_cfdis f
      WHERE (
              (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
           OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
            )
        AND UPPER(f.Status) = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      ORDER BY f.UUID
    `);
  console.log('\n=== CFDI rows (egreso filter) ===');
  r1.recordset.forEach(r => console.log(JSON.stringify(r)));

  // 2. Conceptos per UUID — looking for duplicates
  const r2 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT f.UUID, f.Movimiento, f.TipoComprobante,
             c.IdConcepto, c.Descripcion, c.ClaveProductoServicio, c.Importe
      FROM facturalo_cfdis f
      LEFT JOIN facturalo_conceptos c ON c.UUID = f.UUID
      WHERE (
              (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
           OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
            )
        AND UPPER(f.Status) = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      ORDER BY f.UUID, c.IdConcepto
    `);
  console.log('\n=== Conceptos detail ===');
  r2.recordset.forEach(r => console.log(JSON.stringify(r)));

  // 3. Are there UUIDs where conceptos appear duplicated?
  const r3 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT c.UUID, LEFT(c.Descripcion,60) AS Descripcion, COUNT(*) AS cnt
      FROM facturalo_conceptos c
      JOIN facturalo_cfdis f ON f.UUID = c.UUID
      WHERE (
              (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
           OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
            )
        AND UPPER(f.Status) = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      GROUP BY c.UUID, c.Descripcion
      HAVING COUNT(*) > 1
    `);
  console.log('\n=== Duplicated conceptos (cnt > 1) ===');
  if (r3.recordset.length === 0) console.log('(none found in mayo 2026)');
  r3.recordset.forEach(r => console.log(JSON.stringify(r)));

  // 4. Check all months — maybe it's in a different month
  const r4 = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .query(`
      SELECT c.UUID, LEFT(c.Descripcion,60) AS Descripcion, COUNT(*) AS cnt,
             MIN(f.Fecha) AS Fecha
      FROM facturalo_conceptos c
      JOIN facturalo_cfdis f ON f.UUID = c.UUID
      WHERE (
              (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
           OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
            )
        AND UPPER(f.Status) = 'VIGENTE'
      GROUP BY c.UUID, c.Descripcion
      HAVING COUNT(*) > 1
      ORDER BY MIN(f.Fecha) DESC
    `);
  console.log('\n=== Duplicated conceptos ALL time ===');
  if (r4.recordset.length === 0) console.log('(none)');
  r4.recordset.forEach(r => console.log(JSON.stringify(r)));

  pool.close();
}).catch(e => { console.error(e.message); process.exit(1); });
