const sql = require('mssql');
const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 60000
};
const rfc = process.argv[2] || 'AARA7911189MA';

sql.connect(cfg).then(async pool => {

  // Comparar 3 métodos de calcular IVA
  const r = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .query(`
      SELECT
        COUNT(*) AS facturas,
        SUM(TotalTrasladadoIVA)                                          AS iva_columna,
        SUM(ISNULL(BaseIVA16,0)*0.16 + ISNULL(BaseIVA8,0)*0.08)        AS iva_de_bases,
        SUM(Total - Subtotal)                                            AS iva_diferencia,
        SUM(ISNULL(TotalTrasladadoIVADieciseis,0) + ISNULL(TotalTrasladadoIVAOcho,0) + ISNULL(TotalTrasladadoIVACero,0)) AS iva_desglosado
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc AND TipoComprobante='I' AND Status='Vigente'
    `);
  console.log('Comparacion de metodos IVA:');
  console.log(JSON.stringify(r.recordset[0], null, 2));

  // Facturas donde IVA=0 pero Total>Subtotal (IVA no registrado en columna)
  const bad = await pool.request()
    .input('rfc', sql.NVarChar, rfc)
    .query(`
      SELECT COUNT(*) AS cnt, SUM(Total-Subtotal) AS iva_perdido
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc AND TipoComprobante='I' AND Status='Vigente'
        AND ISNULL(TotalTrasladadoIVA,0) = 0 AND Total > Subtotal AND ISNULL(Descuento,0) = 0
    `);
  console.log('\nFacturas con Total>Subtotal pero TotalTrasladadoIVA=0:');
  console.log(JSON.stringify(bad.recordset[0], null, 2));

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
