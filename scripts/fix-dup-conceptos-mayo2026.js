/**
 * Limpia conceptos duplicados para los 6 UUIDs de mayo 2026 (DGM880621FU5).
 * Mantiene el IdConcepto más bajo de cada grupo de fila idéntica y elimina los demás.
 *
 * Uso:
 *   node scripts/fix-dup-conceptos-mayo2026.js          --dry-run (sólo muestra, no borra)
 *   node scripts/fix-dup-conceptos-mayo2026.js --delete   (aplica el DELETE)
 */
const sql = require('mssql');

const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 120_000,
};

const DRY_RUN = !process.argv.includes('--delete');

// UUIDs detectados con conceptos duplicados en mayo 2026
const UUIDS = [
  'ef5abb9f-3a38-4b69-857e-3ba2bf71dcf6',
  'ff829b1d-3331-43fa-8c2a-8d59c7bacea7',
  '2e709358-ea78-404b-8435-3d9d3a97a402',
  '5a74a84e-6271-4f5d-82ee-f644c5be2b71',
  'f9d4c0b3-13fa-4f4f-80ce-16548468f2b9',
  '2cea9fe4-cc1b-4013-8e89-59b49cb9b8c7',
];

const uuidList = UUIDS.map(u => `'${u}'`).join(',');

sql.connect(cfg).then(async pool => {
  console.log(`\nModo: ${DRY_RUN ? 'DRY-RUN (solo lectura)' : '!!! DELETE REAL !!!'}`);
  console.log(`UUIDs a revisar: ${UUIDS.length}\n`);

  // ── 1. Preview: ¿cuántas filas tiene cada UUID y cuántas se guardarán? ────
  const prev = await pool.request().query(`
    SELECT
      UUID,
      COUNT(*)                                                     AS totalFilas,
      COUNT(DISTINCT CONCAT(
        ISNULL(ClaveProductoServicio,''), '|',
        ISNULL(Descripcion,''), '|',
        CAST(ISNULL(Cantidad,0) AS varchar(40)), '|',
        CAST(ISNULL(ValorUnitario,0) AS varchar(40)), '|',
        CAST(ISNULL(Importe,0) AS varchar(40)), '|',
        CAST(ISNULL(descuento,0) AS varchar(40))
      ))                                                           AS filasUnicas,
      COUNT(*) - COUNT(DISTINCT CONCAT(
        ISNULL(ClaveProductoServicio,''), '|',
        ISNULL(Descripcion,''), '|',
        CAST(ISNULL(Cantidad,0) AS varchar(40)), '|',
        CAST(ISNULL(ValorUnitario,0) AS varchar(40)), '|',
        CAST(ISNULL(Importe,0) AS varchar(40)), '|',
        CAST(ISNULL(descuento,0) AS varchar(40))
      ))                                                           AS filasAEliminar
    FROM facturalo_conceptos WITH (NOLOCK)
    WHERE UUID IN (${uuidList})
    GROUP BY UUID
    ORDER BY filasAEliminar DESC
  `);

  let totalAEliminar = 0;
  console.log('UUID                                      totalFilas  únicas  aEliminar');
  console.log('─'.repeat(72));
  for (const r of prev.recordset) {
    console.log(
      `${r.UUID}  ${String(r.totalFilas).padStart(10)}  ${String(r.filasUnicas).padStart(6)}  ${String(r.filasAEliminar).padStart(9)}`
    );
    totalAEliminar += r.filasAEliminar;
  }
  console.log('─'.repeat(72));
  console.log(`Total filas a eliminar: ${totalAEliminar}\n`);

  if (DRY_RUN) {
    console.log('-- DRY-RUN: no se realizó ningún cambio.');
    console.log('-- Ejecuta con --delete para aplicar el borrado.\n');
    process.exit(0);
  }

  // ── 2. DELETE: eliminar duplicados, conservando MIN(IdConcepto) por grupo ─
  const result = await pool.request().query(`
    DELETE FROM facturalo_conceptos
    WHERE IdConcepto NOT IN (
      SELECT MIN(IdConcepto)
      FROM facturalo_conceptos
      WHERE UUID IN (${uuidList})
      GROUP BY
        UUID,
        ISNULL(ClaveProductoServicio,''),
        ISNULL(Descripcion,''),
        ISNULL(Cantidad,0),
        ISNULL(ValorUnitario,0),
        ISNULL(Importe,0),
        ISNULL(descuento,0)
    )
    AND UUID IN (${uuidList})
  `);

  console.log(`Filas eliminadas: ${result.rowsAffected[0]}`);

  // ── 3. Verificación post-borrado ──────────────────────────────────────────
  const verify = await pool.request().query(`
    SELECT
      f.UUID,
      CONVERT(varchar(10), f.Fecha, 23)           AS Fecha,
      f.Subtotal                                   AS subtotalCabecera,
      SUM(ISNULL(c.Importe,0))                     AS sumConceptos,
      f.Subtotal - SUM(ISNULL(c.Importe,0))        AS diferencia,
      COUNT(c.IdConcepto)                          AS numConceptos
    FROM facturalo_cfdis f WITH (NOLOCK)
    INNER JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
    WHERE f.UUID IN (${uuidList})
    GROUP BY f.UUID, f.Fecha, f.Subtotal
    ORDER BY f.Fecha
  `);

  console.log('\nVerificación post-borrado:');
  console.log('UUID                                      Fecha       SubtotalCab   SumConc      Dif      nConc');
  console.log('─'.repeat(100));
  for (const r of verify.recordset) {
    const ok = Math.abs(r.diferencia) < 0.01 ? 'OK' : 'PENDIENTE';
    console.log(
      `${r.UUID}  ${r.Fecha}  ${fmt(r.subtotalCabecera).padStart(13)}  ${fmt(r.sumConceptos).padStart(11)}  ${fmt(r.diferencia).padStart(9)}  ${String(r.numConceptos).padStart(5)}  ${ok}`
    );
  }

  console.log('\nListo.\n');
  process.exit(0);
}).catch(e => { console.error('Error:', e.message); process.exit(1); });

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}
