const sql = require('mssql');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const path = require('path');

const { config: sqlConfig } = require('./conectarSql');
const { excelDecorate } = require('./variablesEstaticas');
const { consultarNombre, precargarTC } = require('./consultasSql');
const { escribirEncabezadoRfc, writeTableHeadersPagos, ajustarAnchoColumnas } = require('./variablesEspecificas');

/* =========================
   MAIN
========================= */
async function generarExcelStream({ rfc, fechaIn, fechaFin, stream }) {
  await sql.connect(sqlConfig);
  await precargarTC(rfc);

  // Log para depuración: mostrar RFC recibido
  console.log('generarExcelPagos: RFC recibido ->', rfc);

  const nombreEmpresa = await consultarNombre(rfc);
  // Log para depuración: mostrar nombre obtenido de la consulta
  console.log('generarExcelPagos: nombreEmpresa devuelto ->', nombreEmpresa);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true
  });

  await generarPagosWorkbook(wb, rfc, fechaIn, fechaFin, nombreEmpresa);
}

/* =========================
   CORE
========================= */
function generarPagosWorkbook(wb, rfc, fechaInicio, fechaFinal, nombreEmpresa) {
  return new Promise((resolve, reject) => {
    try {
      const ws = wb.addWorksheet('PAGOS');
      ajustarAnchoColumnas(ws);

      // Encabezado empresa
      escribirEncabezadoRfc(ws, nombreEmpresa);
      ws.addRow([]).commit();

      // Headers pagos
      writeTableHeadersPagos(ws);

      const req = new sql.Request();
      req.stream = true;
      req.timeout = 120000; // 120 segundos para queries complejas
      req.input('rfc', sql.VarChar, rfc);
      // Pasar fechas como VarChar y convertir en SQL para evitar que JS aplique offset de zona horaria
      req.input('fechaInicio', sql.VarChar, dayjs(fechaInicio).format('YYYY-MM-DD'));
      req.input('fechaFinal', sql.VarChar, dayjs(fechaFinal).format('YYYY-MM-DD'));

      req.query(`
        SELECT
          -- ===== DATOS DEL PAGO =====
          p.UUID                               AS uuid_pago,
          fc.Fecha                             AS fechaEmision,
          p.fecha_pago                         AS fechaPago,
          p.forma_pago, 
          p.moneda                             AS moneda_pago,
          ISNULL(p.tipoCambio, 1)              AS tipoCambio,
          TRY_CONVERT(decimal(18,2), p.monto_total_pagos) AS total_pago,
        
          -- ===== DOCUMENTO RELACIONADO =====
          d.uuid_doc_relacionado               AS uuid_relacionado,
          d.moneda_pago                        AS moneda_docto,
          d.numParcialidad,                   
          d.saldo_anterior,
          d.saldo_pagado,
          d.saldo_insoluto,
          d.base,
          d.impuesto,
          d.tipo_factor,
          d.tasa_o_cuota,
          d.importe,
          d.objetoImpuesto,
          fc.RFC_emisor,
          fc.RFC_receptor
        
        FROM dbo.facturalo_pagos p (NOLOCK)
        LEFT JOIN dbo.facturalo_pago_doc_relacionado d (NOLOCK) ON d.pago_id = p.id
        INNER JOIN (
          SELECT DISTINCT UUID, Fecha, RFC_emisor, RFC_receptor
          FROM dbo.facturalo_cfdis (NOLOCK)
          WHERE TipoComprobante = 'P'
          AND status = 'Vigente'
          AND fecha >= CONVERT(date, @fechaInicio, 23)
          AND fecha <= CONVERT(date, @fechaFinal, 23)
        ) fc ON fc.UUID = p.UUID
        
        WHERE (fc.RFC_emisor = @rfc OR fc.RFC_receptor = @rfc)
        AND p.fecha_pago >= CONVERT(date, @fechaInicio, 23)
        AND p.fecha_pago <= CONVERT(date, @fechaFinal, 23)
        
        ORDER BY p.fecha_pago, d.numParcialidad;

      `);

    req.on('row', row => {
    
      const tc = row.tipoCambio || 1;
    
      const excelRow = ws.addRow([
        row.fechaEmision,                 // Fecha Emision
        row.fechaPago,                   // Fecha Pago
        row.uuid_pago,                 // UUID Pago
        row.RFC_emisor,                // RFC Emisor
        row.RFC_receptor,              // RFC Receptor
        row.forma_pago,                // Forma Pago
        row.moneda_pago,               // Moneda Pago
        tc,                            // Tipo Cambio
        row.total_pago * tc,           // Total Pago
    
        row.uuid_relacionado,          // UUID Documento
        row.moneda_docto,              // Moneda Documento
        row.numParcialidad,            // Num Parcialidad
        row.saldo_anterior * tc,       // Saldo Anterior
        row.saldo_pagado * tc,         // Importe Pagado
        row.saldo_insoluto * tc,       // Saldo Insoluto
        row.base * tc,                 // Base
        row.impuesto * tc,             // Impuesto
        row.tipo_factor,               // Tipo Factor
        row.tasa_o_cuota,              // Tasa o Cuota
        row.importe * tc,              // Importe Impuesto
        row.objetoImpuesto             // Objeto Impuesto
      ]);
    
      // Fecha
      excelRow.getCell(1).numFmt = 'dd/mm/yyyy';
      excelRow.getCell(2).numFmt = 'dd/mm/yyyy';
    
      // Importes
      excelRow.eachCell((c, colIndex) => {
        excelDecorate('BORDES', excelRow, null);
        if (colIndex >= 8 && colIndex <= 18) {
          c.numFmt = '"$"#,##0.00';
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