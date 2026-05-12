/**
 * Diagnóstico específico para el problema de ISR en cero
 * node scripts/diag-isr.js [RFC] [YEAR] [MONTH]
 */
const sql = require('mssql');
const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 60000,
};

const rfc      = process.argv[2] || 'AARA7911189MA';
const year     = parseInt(process.argv[3] || '2026');
const month    = parseInt(process.argv[4] || '4');
const dateFrom = new Date(year, month - 1, 1);
const dateTo   = new Date(year, month, 1);

console.log(`RFC=${rfc}  ${year}-${String(month).padStart(2,'0')}\n`);

sql.connect(cfg).then(async pool => {

  // 1. TipoComprobante breakdown de CFDIs emitidos en el rango
  const r1 = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .input('df',  sql.DateTime, dateFrom)
    .input('dt',  sql.DateTime, dateTo)
    .query(`
      SELECT TipoComprobante, Status,
        COUNT(*) AS cnt,
        ISNULL(SUM(Total),0) AS total_sum
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc AND Fecha>=@df AND Fecha<@dt
      GROUP BY TipoComprobante, Status
      ORDER BY TipoComprobante, Status
    `);
  console.log('== CFDIs emitidos por tipo/status ==');
  console.table(r1.recordset);

  // 2. RegimenFiscal detectado (mismo query que usa el dashboard)
  const r2 = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .query(`
      SELECT TOP 1 ISNULL(RegimenFiscal,'') AS regimenFiscal, Fecha
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
        AND RegimenFiscal IS NOT NULL AND RegimenFiscal<>''
      ORDER BY Fecha DESC
    `);
  console.log('\n== Régimen fiscal detectado (Q6) ==');
  if (r2.recordset.length === 0) {
    console.log('  *** SIN RESULTADOS — regimen quedará vacío, ISR usará caso default ***');
  } else {
    console.log('  RegimenFiscal:', r2.recordset[0].regimenFiscal, '| Fecha:', r2.recordset[0].Fecha);
  }

  // 3. TotalRetenidoISR en ingresos emitidos
  const r3 = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .input('df',  sql.DateTime, dateFrom)
    .input('dt',  sql.DateTime, dateTo)
    .query(`
      SELECT
        ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total                ELSE 0 END),0) AS ingresosMXN,
        ISNULL(SUM(CASE WHEN Status='Vigente' THEN TotalRetenidoISR     ELSE 0 END),0) AS isrRetenido,
        ISNULL(SUM(CASE WHEN Status='Vigente' THEN TotalTrasladadoIVA   ELSE 0 END),0) AS ivaTotal
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
        AND Fecha>=@df AND Fecha<@dt
    `);
  console.log('\n== Valores ISR/IVA del Q1 (ingresos emitidos tipo I) ==');
  console.table(r3.recordset);

  // 4. Egresos recibidos
  const r4 = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .input('df',  sql.DateTime, dateFrom)
    .input('dt',  sql.DateTime, dateTo)
    .query(`
      SELECT ISNULL(SUM(CASE WHEN Status='Vigente' THEN Total ELSE 0 END),0) AS egresosMXN
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
        AND Fecha>=@df AND Fecha<@dt
    `);
  console.log('\n== Egresos recibidos (Q2) ==');
  console.table(r4.recordset);

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
