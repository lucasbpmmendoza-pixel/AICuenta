const sql = require('mssql');
const fs = require('fs');
// Parse .env.local manually
const env = fs.readFileSync('.env','utf8');
env.split('\n').forEach(l=>{ const m=l.match(/^([^#=]+)=(.+)$/); if(m) process.env[m[1].trim()]=m[2].trim().replace(/^['"]|['"]$/g,''); });
const cfg = {
  user: 'mmendoza-server-admin',
  password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net',
  database: 'mmendoza-database',
  port: 1433,
  options: { encrypt: true, trustServerCertificate: false }
};
sql.connect(cfg).then(async pool => {
  const r = await pool.request().query(
    "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('facturalo_cfdis','facturalo_conceptos') ORDER BY TABLE_NAME, ORDINAL_POSITION"
  );
  r.recordset.forEach(c => console.log(c.TABLE_NAME.padEnd(25), c.COLUMN_NAME.padEnd(35), c.DATA_TYPE));
  // Sample row
  const s = await pool.request().query('SELECT TOP 1 * FROM facturalo_cfdis');
  console.log('\n--- SAMPLE ROW facturalo_cfdis ---');
  console.log(JSON.stringify(s.recordset[0], null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
