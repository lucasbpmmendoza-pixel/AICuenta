const sql = require('mssql');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');

const { config: sqlConfig } = require('./conectarSql');
const { excelDecorate } = require('./variablesEstaticas');
const { consultarNombre, precargarTC, getTC } = require('./consultasSql');
const { escribirEncabezadoRfc, writeTableHeadersNotasCredito, ajustarAnchoColumnasNotasCredito } = require('./variablesEspecificas');

/* =========================
   MAIN
========================= */
async function generarExcelStream({ rfc, fechaIn, fechaFin, stream }) {
  await sql.connect(sqlConfig);
  await precargarTC(rfc);

  console.log('generarExcelNotasCredito: RFC recibido ->', rfc);

  const nombreEmpresa = await consultarNombre(rfc);
  console.log('generarExcelNotasCredito: nombreEmpresa devuelto ->', nombreEmpresa);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true
  });

  await generarNotasCreditoWorkbook(wb, rfc, fechaIn, fechaFin, nombreEmpresa);
}

/* =========================
   CORE
========================= */
function generarNotasCreditoWorkbook(wb, rfc, fechaInicio, fechaFinal, nombreEmpresa) {
  return new Promise((resolve, reject) => {
    try {
      const ws = wb.addWorksheet('NOTAS CREDITO');
      ajustarAnchoColumnasNotasCredito(ws);

      escribirEncabezadoRfc(ws, nombreEmpresa);
      ws.addRow([]).commit();

      writeTableHeadersNotasCredito(ws);

      const req = new sql.Request();
      req.stream = true;
      req.timeout = 120000;
      req.input('rfc', sql.VarChar, rfc);
      req.input('fechaInicio', sql.VarChar, dayjs(fechaInicio).format('YYYY-MM-DD'));
      req.input('fechaFinal', sql.VarChar, dayjs(fechaFinal).format('YYYY-MM-DD'));

      console.log(`[NotasCredito] RFC: ${rfc} | fechaInicio: ${dayjs(fechaInicio).format('YYYY-MM-DD')} | fechaFinal: ${dayjs(fechaFinal).format('YYYY-MM-DD')}`);

      req.query(`
        SELECT
          fact.uuid,
          FORMAT(fact.fecha, 'yyyy-MM-dd')                              AS fecha,
          fact.RFC_emisor,
          fact.RegimenFiscal,
          fact.RFC_receptor,
          fact.RegimenFiscalReceptor,
          TRY_CONVERT(decimal(18,2), fact.subtotal)                     AS subtotal,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVAOcho)       AS iva8,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVADieciseis)  AS iva16,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladado)              AS totaltrasladados,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoISR)             AS retISR,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoIVA)             AS retIVA,
          TRY_CONVERT(decimal(18,2), fact.totalretenidos)               AS totalretenidos,
          TRY_CONVERT(decimal(18,2), fact.descuento)                    AS descuento,
          TRY_CONVERT(decimal(18,2), fact.total)                        AS total,
          fact.TipoPago,
          fact.Moneda,
          ISNULL(fact.TipoCambio, 1)                                    AS tipoCambio,
          fact.TipoComprobante,
          fact.MetodoPago
        FROM facturalo_cfdis fact (NOLOCK)
        WHERE fact.Status = 'VIGENTE'
          AND fact.TipoComprobante = 'E'
          AND (fact.RFC_emisor = @rfc OR fact.RFC_receptor = @rfc)
          AND CAST(fact.fecha AS date) >= CAST(@fechaInicio AS date)
          AND CAST(fact.fecha AS date) <= CAST(@fechaFinal AS date)
        ORDER BY fact.fecha
      `);

      req.on('row', row => {
        const tc = (row.tipoCambio && row.tipoCambio > 0) ? row.tipoCambio : getTC(row.Moneda, row.fecha);

        const excelRow = ws.addRow([
          row.fecha,
          row.uuid,
          row.RFC_emisor,
          row.RegimenFiscal,
          row.RFC_receptor,
          row.RegimenFiscalReceptor,
          row.subtotal        * tc,
          row.iva8            * tc,
          row.iva16           * tc,
          row.totaltrasladados * tc,
          row.retISR          * tc,
          row.retIVA          * tc,
          row.totalretenidos  * tc,
          row.descuento       * tc,
          row.total           * tc,
          row.TipoPago,
          row.Moneda,
          tc,
          row.TipoComprobante,
          row.MetodoPago
        ]);

        excelRow.getCell(1).numFmt = 'dd/mm/yyyy';

        excelRow.eachCell((c, colIndex) => {
          excelDecorate('BORDES', excelRow, null);
          if (colIndex >= 7 && colIndex <= 15) {
            c.numFmt = '"$"#,##0.00';
          }
          if (colIndex === 18) {
            c.numFmt = '#,##0.0000';
          }
        });

        excelRow.commit();
      });

      req.on('error', async err => {
        try { await sql.close(); } catch {}
        reject(err);
      });

      req.on('done', async () => {
        try {
          await wb.commit();
          await sql.close();
          resolve();
        } catch (err) {
          try { await sql.close(); } catch {}
          reject(err);
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generarExcelStream };
