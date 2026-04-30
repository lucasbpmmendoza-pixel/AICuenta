const sql = require('mssql');
const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true }
};
sql.connect(cfg).then(async pool => {
  const r = await pool.request().query(
    "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('facturalo_pagos','facturalo_pago_doc_relacionado') ORDER BY TABLE_NAME, ORDINAL_POSITION"
  );
  r.recordset.forEach(c => console.log(c.TABLE_NAME.padEnd(35), c.COLUMN_NAME.padEnd(35), c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH ?? ''));
  const s1 = await pool.request().query('SELECT TOP 1 * FROM facturalo_pagos');
  console.log('\n--- SAMPLE facturalo_pagos ---');
  console.log(JSON.stringify(s1.recordset[0], null, 2));
  const s2 = await pool.request().query('SELECT TOP 1 * FROM facturalo_pago_doc_relacionado');
  console.log('\n--- SAMPLE facturalo_pago_doc_relacionado ---');
  console.log(JSON.stringify(s2.recordset[0], null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
