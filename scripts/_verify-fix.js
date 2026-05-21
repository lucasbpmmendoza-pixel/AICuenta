const sql = require('mssql');
const cfg = {
  user:'mmendoza-server-admin', password:'P@to0102',
  server:'mmendoza-server.database.windows.net', database:'mmendoza-database',
  port:1433, options:{encrypt:true,trustServerCertificate:false,enableArithAbort:true},
  requestTimeout:30000,
};
const uuids = [
  'ef5abb9f-3a38-4b69-857e-3ba2bf71dcf6',
  'ff829b1d-3331-43fa-8c2a-8d59c7bacea7',
  '2e709358-ea78-404b-8435-3d9d3a97a402',
  '5a74a84e-6271-4f5d-82ee-f644c5be2b71',
  'f9d4c0b3-13fa-4f4f-80ce-16548468f2b9',
  '2cea9fe4-cc1b-4013-8e89-59b49cb9b8c7',
];
const list = uuids.map(u => `'${u}'`).join(',');
const fmt = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n)||0);

sql.connect(cfg).then(async pool => {
  // Filas raw de facturalo_cfdis para los 6 UUIDs
  const rRaw = await pool.request().query(`
    SELECT UUID, RFC_Emisor, RFC_Receptor, Movimiento, TipoComprobante, Status,
           CONVERT(varchar(10),Fecha,23) AS Fecha, Subtotal, Total, MetodoPago
    FROM facturalo_cfdis
    WHERE UUID IN (${list})
    ORDER BY UUID, Fecha
  `);
  console.log('\nFilas en facturalo_cfdis para los 6 UUIDs:');
  for (const row of rRaw.recordset) console.log(JSON.stringify(row));

  // Cuántas filas tiene facturalo_cfdis por UUID
  const rCfdis = await pool.request().query(`
    SELECT UUID, COUNT(*) AS numFilasCfdis
    FROM facturalo_cfdis
    WHERE UUID IN (${list})
    GROUP BY UUID
    ORDER BY UUID
  `);
  console.log('\nfilas en facturalo_cfdis por UUID:');
  for (const row of rCfdis.recordset) {
    const dup = row.numFilasCfdis > 1 ? '  <-- DUPLICADO EN CFDIS' : '';
    console.log(`  ${row.UUID}  nFilas=${row.numFilasCfdis}${dup}`);
  }

  // Cuántas filas tiene facturalo_conceptos por UUID
  const rConc = await pool.request().query(`
    SELECT UUID, COUNT(*) AS numConceptos, SUM(ISNULL(Importe,0)) AS sumImporte
    FROM facturalo_conceptos
    WHERE UUID IN (${list})
    GROUP BY UUID
    ORDER BY UUID
  `);
  console.log('\nfilas en facturalo_conceptos por UUID (post-delete):');
  for (const row of rConc.recordset) {
    console.log(`  ${row.UUID}  nConc=${row.numConceptos}  sumImporte=${fmt(row.sumImporte)}`);
  }

  // Join para ver la diferencia real
  const rJoin = await pool.request().query(`
    SELECT f.UUID,
           COUNT(DISTINCT f.UUID + CAST(f.id_interno AS varchar(20))) AS numCfdiRows,
           MIN(f.Subtotal)                   AS cab,
           SUM(ISNULL(c.Importe,0))          AS sumJoin,
           COUNT(c.IdConcepto)               AS nConcJoin
    FROM facturalo_cfdis f
    INNER JOIN facturalo_conceptos c ON c.UUID = f.UUID
    WHERE f.UUID IN (${list})
    GROUP BY f.UUID
    ORDER BY f.UUID
  `).catch(() => null);

  // Si no tiene id_interno intentar con una subquery simple
  const rJoin2 = await pool.request().query(`
    SELECT
      c.UUID,
      (SELECT COUNT(*) FROM facturalo_cfdis WHERE UUID = c.UUID) AS numCfdiRows,
      (SELECT TOP 1 Subtotal FROM facturalo_cfdis WHERE UUID = c.UUID) AS cab,
      COUNT(*)                AS nConc,
      SUM(ISNULL(c.Importe,0)) AS sumConc
    FROM facturalo_conceptos c
    WHERE c.UUID IN (${list})
    GROUP BY c.UUID
    ORDER BY c.UUID
  `);
  console.log('\nConceptos (direct) vs cfdis count:');
  for (const row of rJoin2.recordset) {
    const esperado = row.cab * row.numCfdiRows;
    const ok = Math.abs(row.sumConc - row.cab) < 0.01 ? 'OK' : `PENDIENTE (cfdis=${row.numCfdiRows})`;
    console.log(`  ${row.UUID}  cab=${fmt(row.cab)}  sumConc=${fmt(row.sumConc)}  nConc=${row.nConc}  cfdiRows=${row.numCfdiRows}  ${ok}`);
  }

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
