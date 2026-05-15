require('dotenv').config({ path: '.env' });
const sql = require('mssql');

const cfg = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  port: Number(process.env.AZURE_SQL_PORT ?? 1433),
  options: { encrypt: true, trustServerCertificate: false },
  requestTimeout: 60000,
};

(async () => {
  const pool = await sql.connect(cfg);
  const rfc = 'DMM180222I17';

  const r1 = await pool.request().input('rfc', sql.NVarChar, rfc).query(`
    SELECT COUNT(*) AS cnt, SUM(TRY_CONVERT(decimal(18,2), p.monto_total_pagos)) AS total
    FROM dbo.facturalo_cfdis fc WITH (NOLOCK)
    INNER JOIN dbo.facturalo_pagos p WITH (NOLOCK) ON p.UUID = fc.UUID
    WHERE fc.RFC_Receptor = @rfc
      AND fc.TipoComprobante = 'P'
      AND fc.Status = 'Vigente'
  `);
  console.log('Complementos P recibidos (gastos):', r1.recordset[0]);

  const r2 = await pool.request().input('rfc', sql.NVarChar, rfc).query(`
    SELECT COUNT(*) AS cnt, SUM(TRY_CONVERT(decimal(18,2), Total)) AS total
    FROM dbo.facturalo_cfdis WITH (NOLOCK)
    WHERE RFC_Receptor = @rfc
      AND TipoComprobante = 'I'
      AND MetodoPago = 'PUE'
      AND Status = 'Vigente'
  `);
  console.log('Facturas PUE recibidas (gastos):', r2.recordset[0]);

  await pool.close();
})().catch(e => console.error(e.message));
