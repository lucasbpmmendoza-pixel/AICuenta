/**
 * Diagnóstico: por qué difieren los totales de EF vs Facturas
 * node scripts/diag-ef-vs-facturas.js DGM880621FU5 2026 5
 */
const sql = require('mssql');

const cfg = {
  user: 'mmendoza-server-admin', password: 'P@to0102',
  server: 'mmendoza-server.database.windows.net', database: 'mmendoza-database',
  port: 1433, options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  requestTimeout: 300_000,
};

const rfc   = process.argv[2] || 'DGM880621FU5';
const year  = parseInt(process.argv[3] || '2026');
const month = parseInt(process.argv[4] || '5');
const dateFrom = new Date(year, month - 1, 1);
const dateTo   = new Date(year, month, 1);

console.log(`\nDiagnóstico EF vs Facturas: RFC=${rfc} ${year}-${String(month).padStart(2,'0')}`);
console.log(`dateFrom=${dateFrom.toISOString()} dateTo=${dateTo.toISOString()}\n`);

const TC = `ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), tipoCambio), 0), 1)`;

sql.connect(cfg).then(async pool => {

  // ── 1. Lo que suma el Excel de FACTURAS (desde cabecera cfdis) ────────────
  const r1 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT
        COUNT(*)                                                               AS numCFDIs,
        SUM(ISNULL(Subtotal,0)                    * ${TC})                    AS subtotal,
        SUM(ISNULL(TotalTrasladadoIVAOcho,0)      * ${TC})                    AS iva8,
        SUM(ISNULL(TotalTrasladadoIVADieciseis,0) * ${TC})                    AS iva16,
        SUM(ISNULL(TotalTrasladadoIEPS,0)         * ${TC})                    AS ieps,
        SUM(ISNULL(TotalTrasladado,0)             * ${TC})                    AS totalTrasladado,
        SUM(ISNULL(TotalRetenidoISR,0)            * ${TC})                    AS retISR,
        SUM(ISNULL(TotalRetenidoIVA,0)            * ${TC})                    AS retIVA,
        SUM(ISNULL(Descuento,0)                   * ${TC})                    AS descuento,
        SUM(ISNULL(Total,0)                       * ${TC})                    AS totalFinal
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND UPPER(Movimiento)    = 'INGRESO'
        AND TipoComprobante      IN ('I','E')
        AND UPPER(Status)        = 'VIGENTE'
        AND Fecha >= @dateFrom AND Fecha < @dateTo
    `);
  const f = r1.recordset[0];
  console.log('══════════════════════════════════════════════════════');
  console.log('Excel FACTURAS (cabecera cfdi, Movimiento=INGRESO)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  CFDIs:              ${f.numCFDIs}`);
  console.log(`  Subtotal:           ${fmt(f.subtotal)}`);
  console.log(`  IVA 8%:             ${fmt(f.iva8)}`);
  console.log(`  IVA 16%:            ${fmt(f.iva16)}`);
  console.log(`  IEPS:               ${fmt(f.ieps)}`);
  console.log(`  Total Trasladado:   ${fmt(f.totalTrasladado)}`);
  console.log(`  Ret. ISR:           ${fmt(f.retISR)}`);
  console.log(`  Ret. IVA:           ${fmt(f.retIVA)}`);
  console.log(`  Descuento:          ${fmt(f.descuento)}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total (campo Total):${fmt(f.totalFinal)}`);
  console.log(`  Subtotal+IVA8+IVA16:${fmt(f.subtotal + f.iva8 + f.iva16)}`);
  console.log(`  Dif Total vs S+8+16:${fmt(f.totalFinal - (f.subtotal + f.iva8 + f.iva16))}`);

  // ── 2. Lo que suma el Excel de EF (desde conceptos LEFT JOIN cfdis) ───────
  const r2 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT
        COUNT(DISTINCT f.UUID)                                                 AS numCFDIs,
        COUNT(*)                                                               AS numConceptos,
        SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) - ISNULL(c.Descuento,0)
                 ELSE ISNULL(f.Subtotal,0) END
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)) AS importe,
        SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
          THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) - ISNULL(c.Descuento,0) ELSE ISNULL(f.Subtotal,0) END
               / f.Subtotal
               * ISNULL(f.TotalTrasladadoIVAOcho, 0)
               * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
          ELSE 0 END)                                                          AS iva8,
        SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
          THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) - ISNULL(c.Descuento,0) ELSE ISNULL(f.Subtotal,0) END
               / f.Subtotal
               * ISNULL(f.TotalTrasladadoIVADieciseis, 0)
               * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
          ELSE 0 END)                                                          AS iva16
      FROM facturalo_cfdis f WITH (NOLOCK)
      LEFT JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
      WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND UPPER(f.Movimiento)    = 'INGRESO'
        AND f.TipoComprobante      IN ('I','E')
        AND UPPER(f.Status)        = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
    `);
  const e = r2.recordset[0];
  const efTotal = e.importe + e.iva8 + e.iva16;
  console.log('\n══════════════════════════════════════════════════════');
  console.log('Excel ESTADOS FINANCIEROS (LEFT JOIN conceptos)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  CFDIs únicos:       ${e.numCFDIs}`);
  console.log(`  Filas conceptos:    ${e.numConceptos}`);
  console.log(`  Subtotal (importe): ${fmt(e.importe)}`);
  console.log(`  IVA 8%:             ${fmt(e.iva8)}`);
  console.log(`  IVA 16%:            ${fmt(e.iva16)}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total EF:           ${fmt(efTotal)}`);

  // ── 3. Diferencia ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('DIFERENCIAS');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Total Facturas:     ${fmt(f.totalFinal)}`);
  console.log(`  Total EF:           ${fmt(efTotal)}`);
  console.log(`  Diferencia:         ${fmt(f.totalFinal - efTotal)}`);
  console.log(`  IEPS (posible gap): ${fmt(f.ieps)}`);
  console.log(`  Descuento cabecera: ${fmt(f.descuento)}`);
  console.log(`  Dif importe vs sub: ${fmt(f.subtotal - e.importe)}`);
  console.log(`  CFDIs Fact vs EF:   ${f.numCFDIs} vs ${e.numCFDIs}  (dif=${f.numCFDIs - e.numCFDIs})`);

  // ── 4. CFDIs con IEPS ─────────────────────────────────────────────────────
  const r3 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT COUNT(*) AS cnt, SUM(ISNULL(TotalTrasladadoIEPS,0) * ${TC}) AS totalIEPS
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND UPPER(Movimiento) = 'INGRESO'
        AND TipoComprobante   IN ('I','E')
        AND UPPER(Status)     = 'VIGENTE'
        AND ISNULL(TotalTrasladadoIEPS,0) <> 0
        AND Fecha >= @dateFrom AND Fecha < @dateTo
    `);
  const ieps = r3.recordset[0];
  console.log(`\n  CFDIs con IEPS > 0: ${ieps.cnt}  →  IEPS total: ${fmt(ieps.totalIEPS)}`);

  // ── 5. CFDIs sin conceptos ────────────────────────────────────────────────
  const r4 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT COUNT(*) AS cnt, SUM(ISNULL(f.Subtotal,0) * ${TC}) AS subtotalSinConc
      FROM facturalo_cfdis f WITH (NOLOCK)
      WHERE (f.RFC_Emisor=@rfc OR f.RFC_Receptor=@rfc)
        AND UPPER(f.Movimiento) = 'INGRESO'
        AND f.TipoComprobante   IN ('I','E')
        AND UPPER(f.Status)     = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        AND NOT EXISTS (SELECT 1 FROM facturalo_conceptos c WITH (NOLOCK) WHERE c.UUID = f.UUID)
    `);
  const sinConc = r4.recordset[0];
  console.log(`  CFDIs sin conceptos:${sinConc.cnt}  →  Subtotal: ${fmt(sinConc.subtotalSinConc)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOQUE EGRESOS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 6. Excel FACTURAS – EGRESOS (cabecera cfdi, Movimiento=EGRESO) ────────
  const r5 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT
        COUNT(*)                                                               AS numCFDIs,
        SUM(ISNULL(Subtotal,0)                    * ${TC})                    AS subtotal,
        SUM(ISNULL(TotalTrasladadoIVAOcho,0)      * ${TC})                    AS iva8,
        SUM(ISNULL(TotalTrasladadoIVADieciseis,0) * ${TC})                    AS iva16,
        SUM(ISNULL(TotalTrasladadoIEPS,0)         * ${TC})                    AS ieps,
        SUM(ISNULL(TotalTrasladado,0)             * ${TC})                    AS totalTrasladado,
        SUM(ISNULL(TotalRetenidoISR,0)            * ${TC})                    AS retISR,
        SUM(ISNULL(TotalRetenidoIVA,0)            * ${TC})                    AS retIVA,
        SUM(ISNULL(Descuento,0)                   * ${TC})                    AS descuento,
        SUM(ISNULL(Total,0)                       * ${TC})                    AS totalFinal
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND UPPER(Movimiento)    = 'EGRESO'
        AND TipoComprobante      IN ('I','E')
        AND UPPER(Status)        = 'VIGENTE'
        AND Fecha >= @dateFrom AND Fecha < @dateTo
    `);
  const eg = r5.recordset[0];
  console.log('\n══════════════════════════════════════════════════════');
  console.log('Excel FACTURAS - EGRESOS (cabecera cfdi, Movimiento=EGRESO)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  CFDIs:              ${eg.numCFDIs}`);
  console.log(`  Subtotal:           ${fmt(eg.subtotal)}`);
  console.log(`  IVA 8%:             ${fmt(eg.iva8)}`);
  console.log(`  IVA 16%:            ${fmt(eg.iva16)}`);
  console.log(`  IEPS:               ${fmt(eg.ieps)}`);
  console.log(`  Total Trasladado:   ${fmt(eg.totalTrasladado)}`);
  console.log(`  Ret. ISR:           ${fmt(eg.retISR)}`);
  console.log(`  Ret. IVA:           ${fmt(eg.retIVA)}`);
  console.log(`  Descuento:          ${fmt(eg.descuento)}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total (campo Total):${fmt(eg.totalFinal)}`);
  console.log(`  Subtotal+IVA8+IVA16:${fmt(eg.subtotal + eg.iva8 + eg.iva16)}`);
  console.log(`  Dif Total vs S+8+16:${fmt(eg.totalFinal - (eg.subtotal + eg.iva8 + eg.iva16))}`);

  // ── 7. Excel EF – EGRESOS (LEFT JOIN conceptos) ───────────────────────────
  const r6 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT
        COUNT(DISTINCT f.UUID)                                                 AS numCFDIs,
        COUNT(*)                                                               AS numConceptos,
        SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0)
                 ELSE ISNULL(f.Subtotal,0) END
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)) AS importe,
        SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
          THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
               / f.Subtotal
               * ISNULL(f.TotalTrasladadoIVAOcho, 0)
               * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
          ELSE 0 END)                                                          AS iva8,
        SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
          THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
               / f.Subtotal
               * ISNULL(f.TotalTrasladadoIVADieciseis, 0)
               * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
          ELSE 0 END)                                                          AS iva16
      FROM facturalo_cfdis f WITH (NOLOCK)
      LEFT JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
      WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND UPPER(f.Movimiento)    = 'EGRESO'
        AND f.TipoComprobante      IN ('I','E')
        AND UPPER(f.Status)        = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
    `);
  const efEg = r6.recordset[0];
  const efEgTotal = efEg.importe + efEg.iva8 + efEg.iva16;
  console.log('\n══════════════════════════════════════════════════════');
  console.log('Excel ESTADOS FINANCIEROS - EGRESOS (LEFT JOIN conceptos)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  CFDIs únicos:       ${efEg.numCFDIs}`);
  console.log(`  Filas conceptos:    ${efEg.numConceptos}`);
  console.log(`  Subtotal (importe): ${fmt(efEg.importe)}`);
  console.log(`  IVA 8%:             ${fmt(efEg.iva8)}`);
  console.log(`  IVA 16%:            ${fmt(efEg.iva16)}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total EF (S+8+16):  ${fmt(efEgTotal)}`);

  // ── 8. DIFERENCIAS EGRESOS ────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('DIFERENCIAS EGRESOS');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Total Facturas:          ${fmt(eg.totalFinal)}`);
  console.log(`  Total EF (Subt+IVA):     ${fmt(efEgTotal)}`);
  console.log(`  Dif Total vs EF:         ${fmt(eg.totalFinal - efEgTotal)}`);
  console.log(`  IEPS (gap potencial):    ${fmt(eg.ieps)}`);
  console.log(`  Descuento cabecera:      ${fmt(eg.descuento)}`);
  console.log(`  Dif Subtotal vs importe: ${fmt(eg.subtotal - efEg.importe)}`);
  console.log(`  CFDIs Fact vs EF:        ${eg.numCFDIs} vs ${efEg.numCFDIs}  (dif=${eg.numCFDIs - efEg.numCFDIs})`);

  // ── 9. Facturas de EGRESOS donde sum(conceptos.Importe) <> f.Subtotal ─────
  const r7 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT TOP 20
        f.UUID,
        f.RFC_Emisor,
        f.RFC_Receptor,
        CONVERT(varchar(10), f.Fecha, 23)                            AS Fecha,
        f.Subtotal                                                   AS subtotalCabecera,
        SUM(ISNULL(c.Importe,0))                                     AS sumConceptos,
        f.Subtotal - SUM(ISNULL(c.Importe,0))                       AS diferencia,
        COUNT(c.UUID)                                                AS numConceptos
      FROM facturalo_cfdis f WITH (NOLOCK)
      INNER JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
      WHERE (f.RFC_Emisor=@rfc OR f.RFC_Receptor=@rfc)
        AND UPPER(f.Movimiento)   = 'EGRESO'
        AND f.TipoComprobante    IN ('I','E')
        AND UPPER(f.Status)       = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      GROUP BY f.UUID, f.RFC_Emisor, f.RFC_Receptor, f.Fecha, f.Subtotal
      HAVING ABS(f.Subtotal - SUM(ISNULL(c.Importe,0))) > 0.01
      ORDER BY ABS(f.Subtotal - SUM(ISNULL(c.Importe,0))) DESC
    `);
  console.log('\n══════════════════════════════════════════════════════');
  console.log('EGRESOS: CFDIs donde sum(concepto.Importe) != Subtotal cabecera');
  console.log('══════════════════════════════════════════════════════');
  if (r7.recordset.length === 0) {
    console.log('  (ninguno — conceptos cuadran con la cabecera)');
  } else {
    for (const row of r7.recordset) {
      console.log(`  UUID: ${row.UUID}`);
      console.log(`    Emisor: ${row.RFC_Emisor}  Receptor: ${row.RFC_Receptor}  Fecha: ${row.Fecha}`);
      console.log(`    Subtotal cabecera: ${fmt(row.subtotalCabecera)}  Sum conceptos: ${fmt(row.sumConceptos)}  Dif: ${fmt(row.diferencia)}  nConc: ${row.numConceptos}`);
    }
  }

  // ── 10. Valores de Movimiento presentes en el periodo ────────────────────
  const r8 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      SELECT
        ISNULL(NULLIF(UPPER(Movimiento),''), '(NULL/vacío)')         AS Movimiento,
        TipoComprobante,
        UPPER(Status)                                                AS Status,
        COUNT(*)                                                     AS num,
        SUM(ISNULL(Total,0) * ${TC})                                 AS totalMXN
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND Fecha >= @dateFrom AND Fecha < @dateTo
        AND TipoComprobante IN ('I','E')
      GROUP BY ISNULL(NULLIF(UPPER(Movimiento),''), '(NULL/vacío)'), TipoComprobante, UPPER(Status)
      ORDER BY TipoComprobante, Movimiento, Status
    `);
  console.log('\n══════════════════════════════════════════════════════');
  console.log('Todos los valores de Movimiento en el periodo (TipoComp I/E)');
  console.log('══════════════════════════════════════════════════════');
  for (const row of r8.recordset) {
    console.log(`  Movimiento=${row.Movimiento.padEnd(14)}  TipoComp=${row.TipoComprobante}  Status=${row.Status.padEnd(10)}  num=${String(row.num).padStart(4)}  total=${fmt(row.totalMXN)}`);
  }

  // ── 11. Diferencia INGRESOS: CFDIs solo en facturas o solo en EF ─────────
  const r9 = await pool.request()
    .input('rfc',      sql.NVarChar, rfc)
    .input('dateFrom', sql.DateTime,  dateFrom)
    .input('dateTo',   sql.DateTime,  dateTo)
    .query(`
      -- Facturas con conceptos duplicados por UUID que inflan el LEFT JOIN
      SELECT TOP 10
        f.UUID,
        CONVERT(varchar(10), f.Fecha, 23)   AS Fecha,
        f.Subtotal,
        COUNT(c.UUID)                        AS numConceptos,
        SUM(ISNULL(c.Importe,0))             AS sumConceptos,
        f.TipoComprobante,
        UPPER(f.Movimiento)                  AS Movimiento
      FROM facturalo_cfdis f WITH (NOLOCK)
      INNER JOIN facturalo_conceptos c WITH (NOLOCK) ON c.UUID = f.UUID
      WHERE (f.RFC_Emisor=@rfc OR f.RFC_Receptor=@rfc)
        AND UPPER(f.Movimiento)   IN ('INGRESO','EGRESO')
        AND f.TipoComprobante    IN ('I','E')
        AND UPPER(f.Status)       = 'VIGENTE'
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      GROUP BY f.UUID, f.Fecha, f.Subtotal, f.TipoComprobante, f.Movimiento
      HAVING COUNT(c.UUID) > 50
      ORDER BY COUNT(c.UUID) DESC
    `);
  console.log('\n══════════════════════════════════════════════════════');
  console.log('CFDIs con mas de 50 conceptos (posible causa de diferencias en EF)');
  console.log('══════════════════════════════════════════════════════');
  if (r9.recordset.length === 0) {
    console.log('  (ninguno)');
  } else {
    for (const row of r9.recordset) {
      console.log(`  UUID: ${row.UUID}  Fecha: ${row.Fecha}  Tipo: ${row.TipoComprobante}  Mov: ${row.Movimiento}`);
      console.log(`    Subtotal cabecera: ${fmt(row.Subtotal)}  Sum conceptos: ${fmt(row.sumConceptos)}  nConc: ${row.numConceptos}`);
    }
  }

  // ── 12. Resumen bruto: todas las diferencias en un solo lugar ────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('RESUMEN FINAL');
  console.log('══════════════════════════════════════════════════════');
  const ingrTotal = f.subtotal + f.iva8 + f.iva16;
  const ingrEF    = e.importe  + e.iva8 + e.iva16;
  console.log('  INGRESOS');
  console.log(`    Total (S+8+16) Facturas: ${fmt(ingrTotal)}`);
  console.log(`    Total          EF:       ${fmt(ingrEF)}`);
  console.log(`    Diferencia:              ${fmt(ingrTotal - ingrEF)}`);
  console.log('  EGRESOS');
  console.log(`    Total (S+8+16) Facturas: ${fmt(eg.subtotal + eg.iva8 + eg.iva16)}`);
  console.log(`    Total          EF:       ${fmt(efEgTotal)}`);
  console.log(`    Diferencia:              ${fmt((eg.subtotal + eg.iva8 + eg.iva16) - efEgTotal)}`);

  console.log('\n');
  process.exit(0);
}).catch(e => { console.error('Error:', e.message); process.exit(1); });

function fmt(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}
