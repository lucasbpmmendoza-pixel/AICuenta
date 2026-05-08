const sql = require('mssql');
const ExcelJS = require('exceljs');
const axios = require('axios');
const dayjs = require('dayjs');
const path = require('path');
// Traer la configuración de otros java a este
const { config: sqlConfig } = require('./conectarSql');
const { excelDecorate, transformarTipoCFDI, transformarTipoPago, sacarColor,  MESES, TIPOS } = require('./variablesEstaticas');
const {resetTotales, acumular, writeTotalesMes, writeSectionTitle } = require('./variablesGenerales');
const { consultarNombre, precargarTC, getTC} = require('./consultasSql');
const { escribirEncabezadoRfc, writeTableHeaders, writeTotales, ajustarAnchoColumnas, ajustarAnchoColumnasTotales} = require('./variablesEspecificas');
const advancedFormat = require('dayjs/plugin/advancedFormat');
dayjs.extend(advancedFormat);

/* =========================
   MAIN
========================= */
async function generarExcel({ rfc }) {
  // Conectar a la DB con la configuración importada
  await sql.connect(sqlConfig);

  await precargarTC(rfc);
  
  // Consultar el nombre de la empresa antes de crear el workbook
  const nombreEmpresa = await consultarNombre(rfc);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: path.join(__dirname, `CFDI_${rfc}_2025.xlsx`),
    useStyles: true
  });

  
  await generarConWorkbook(wb, rfc, null, null, null, nombreEmpresa);
}

// Versión que escribe directamente a un stream (e.g., la respuesta HTTP)
async function generarExcelStream({ rfc, fechaIn, fechaFin, metodoPago, stream }) {
   const fechaInicio=fechaIn;
   const fechaFinal=fechaFin;
   const metodoP=metodoPago;

  await sql.connect(sqlConfig);
  await precargarTC(rfc);

  // Consultar el nombre de la empresa antes de crear el workbook
  const nombreEmpresa = await consultarNombre(rfc);

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: stream,
    useStyles: true
  });

  await generarConWorkbook(wb, rfc, fechaInicio, fechaFinal, metodoP, nombreEmpresa);
}

// Función interna que usa un WorkbookWriter ya creado para llenar y cerrar.
function generarConWorkbook(wb, rfc, fechaInicio, fechaFinal, metodoP, nombreEmpresa) {
  return new Promise((resolve, reject) => {
    try {
      const wsTotales = wb.addWorksheet('TOTALES');
      // Ajustar el ancho de las columnas a 13//////////////////////////////////
      wsTotales.columns = Array(20).fill({ width: 13 });
      ajustarAnchoColumnasTotales(wsTotales);
      const sheets = {};
      const totales = {};
      const buffers = {};
      const retencionesRows = [];
      // Calcular dinámicamente los meses relevantes basados en el rango de fechas proporcionado.
      // Esto asegura que solo se procesen y creen hojas para los meses que caen dentro de fechaInicio y fechaFinal.
      // Se usa dayjs para iterar mes a mes desde el inicio del mes de fechaInicio hasta el final del mes de fechaFinal.
      const mesesRelevantes = new Set();
      metodoPagoG = metodoP;

      if (fechaInicio && fechaFinal) {
        let current = dayjs(fechaInicio).startOf('month');
        const end = dayjs(fechaFinal).endOf('month');
        while (current.isBefore(end) || current.isSame(end, 'month')) {
          mesesRelevantes.add(current.format('YYYY-MMMM'));
          current = current.add(1, 'month');
        }
      }
      const mesesArray = Array.from(mesesRelevantes).sort();

      // Inicializar estructuras de datos para acumular totales y almacenar filas de datos por mes.
      mesesArray.forEach(m => {
        totales[m] = {
          INGRESOS: resetTotales(),
          GASTOS: resetTotales(),
          'GASTOS - NOMINA': resetTotales()
        };

        buffers[m] = {
          INGRESOS: [],
          GASTOS: [],
          'GASTOS - NOMINA': []
        };
      });

      // Escribir encabezados 
      escribirEncabezadoRfc(wsTotales, nombreEmpresa);
      
      // Encabezado de totales de la hoja TOTALES
      /**
       * Agrega el encabezado de la tabla de totales en la hoja "TOTALESSSSSSSSSSSSSSSSSSSSSS la hoja que dice totales".
       */
      const headerTotales = wsTotales.addRow([
        'Mes',
        'Tipo',
        'Subtotal',
        'IVA 8',
        'IVA 16',
        'IVA Total',
        'Descuento',
        'Ret ISR',
        'Ret IVA',
        'Total Retenciones',
        'Total'
      ]);
      
////////////////Se agrega el css al excel a totales de totalesssssssssss////////////

      headerTotales.font = { bold: true };
      excelDecorate('BORDES', headerTotales, null);
      excelDecorate('CENTRAR', headerTotales, null);
      headerTotales.commit();

      // Preparar y ejecutar la consulta SQL con streaming
      const req = new sql.Request();
      req.stream = true;
      req.timeout = 120000; // 120 segundos para queries complejas
      req.input('rfc', sql.VarChar, rfc);
      // Pasar fechas como VarChar y convertir en SQL para evitar que JS aplique offset de zona horaria
      req.input('fechaInicio', sql.VarChar, fechaInicio ? dayjs(fechaInicio).format('YYYY-MM-DD') : null);
      req.input('fechaFinal', sql.VarChar, fechaFinal ? dayjs(fechaFinal).format('YYYY-MM-DD') : null);
      req.input('metodoPagoG', sql.VarChar, metodoPagoG);

      // Consulta SQL para obtener los datos necesarios según los parámetros proporcionados
      if(metodoPagoG == 'PUE' || metodoPagoG == 'PPD'){
        console.log('muestra solo uno');
        req.query(`
        SELECT
          fact.uuid,
          FORMAT(fact.fecha, 'yyyy-MM-dd') AS fecha,
          fact.RFC_emisor,
          fact.RegimenFiscal,
          fact.RFC_receptor,
          fact.RegimenFiscalReceptor,
          TRY_CONVERT(decimal(18,2), fact.subtotal) AS subtotal,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVAOcho) AS iva8,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVADieciseis) AS iva16,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladado) AS totaltrasladados,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoISR) AS retISR,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoIVA) AS retIVA,
          TRY_CONVERT(decimal(18,2), fact.totalretenidos) AS totalretenidos,
          TRY_CONVERT(decimal(18,2), fact.descuento) AS descuento,
          TRY_CONVERT(decimal(18,2), fact.total) AS total,
          fact.Moneda,
          fact.Movimiento,
          fact.TipoComprobante,
          fact.TipoPago,
          fact.MetodoPago,
          fact.UsoCFDI,
          ISNULL(fact.TipoCambio, 1) AS tipoCambio
        FROM facturalo_cfdis fact (NOLOCK)
        WHERE fact.Status='VIGENTE'
          AND fact.MetodoPago = @metodoPagoG
          AND (fact.RFC_emisor=@rfc OR fact.RFC_receptor=@rfc)
          AND fact.TipoComprobante IN ('I','E','N')
          AND fact.fecha >= CONVERT(date, @fechaInicio, 23)
          AND fact.fecha <= CONVERT(date, @fechaFinal, 23)
        ORDER BY fact.fecha
      `);
      }else{
        console.log('muestra los 2');
         req.query(`
        SELECT
          fact.uuid,
          FORMAT(fact.fecha, 'yyyy-MM-dd') AS fecha,
          fact.RFC_emisor,
          fact.RegimenFiscal,
          fact.RFC_receptor,
          fact.RegimenFiscalReceptor,
          TRY_CONVERT(decimal(18,2), fact.subtotal) AS subtotal,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVAOcho) AS iva8,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladadoIVADieciseis) AS iva16,
          TRY_CONVERT(decimal(18,2), fact.TotalTrasladado) AS totaltrasladados,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoISR) AS retISR,
          TRY_CONVERT(decimal(18,2), fact.TotalRetenidoIVA) AS retIVA,
          TRY_CONVERT(decimal(18,2), fact.totalretenidos) AS totalretenidos,
          TRY_CONVERT(decimal(18,2), fact.descuento) AS descuento,
          TRY_CONVERT(decimal(18,2), fact.total) AS total,
          fact.Moneda,
          fact.Movimiento,
          fact.TipoComprobante,
          fact.TipoPago,
          fact.MetodoPago,
          fact.UsoCFDI,
          ISNULL(fact.TipoCambio, 1) AS tipoCambio
        FROM facturalo_cfdis fact (NOLOCK)
        WHERE fact.Status='VIGENTE'
          AND (fact.RFC_emisor=@rfc OR fact.RFC_receptor=@rfc)
          AND fact.TipoComprobante IN ('I','E','N')
          AND fact.fecha >= CONVERT(date, @fechaInicio, 23)
          AND fact.fecha <= CONVERT(date, @fechaFinal, 23)
        ORDER BY fact.fecha
      `);
      }

      // STREAM: solo clasificar y acumular
      req.on('row', row => {
        const mes = dayjs(row.fecha, 'YYYY-MM-DD').format('YYYY-MMMM');
        if (!mes) return;
        // Usar tipoCambio de la BD si existe, si no, calcular con getTC como fallback
        const tc = (row.tipoCambio && row.tipoCambio > 0) ? row.tipoCambio : getTC(row.Moneda, row.fecha);

        const movimiento = (row.Movimiento || '').trim().toUpperCase();

        let tipo = null;
        if (row.TipoComprobante === 'N') tipo = 'GASTOS - NOMINA';
        else if (movimiento === 'INGRESO') tipo = 'INGRESOS';
        else if (movimiento === 'EGRESO') tipo = 'GASTOS';
        if (!tipo) return;
        
        const totalRetencion = ((row.retISR || 0) + (row.retIVA || 0)) * tc;
        
        if (totalRetencion !== 0) {
          retencionesRows.push([
            row.RFC_emisor,
            row.RegimenFiscal,
            row.RFC_receptor,
            row.RegimenFiscalReceptor,
            tipo,                               // Clasificación
            (row.subtotal || 0) * tc,
            (row.iva8 || 0) * tc,
            (row.iva16 || 0) * tc,
            (row.totaltrasladados || 0) * tc,
            (row.retISR || 0) * tc,
            (row.retIVA || 0) * tc,
            totalRetencion,
            (row.descuento || 0) * tc,
            (row.total || 0) * tc,
            dayjs(row.fecha, 'YYYY-MM-DD').format('MMMM YYYY')
          ]);
        }

        // Ensure buffers and totales exist for this month (in case fechaInicio/fechaFinal were not provided
        // or the month was not pre-initialized).
        if (!buffers[mes]) {
          totales[mes] = {
            INGRESOS: resetTotales(),
            GASTOS: resetTotales(),
            'GASTOS - NOMINA': resetTotales()
          };
          buffers[mes] = {
            INGRESOS: [],
            GASTOS: [],
            'GASTOS - NOMINA': []
          };
        }

        ////////////meses
        buffers[mes][tipo].push([
          dayjs(row.fecha, 'YYYY-MM-DD').format('DD/MM/YYYY'),
          row.uuid,
          row.RFC_emisor,
          row.RegimenFiscal,
          row.RFC_receptor,
          row.RegimenFiscalReceptor,
          (row.subtotal || 0) * tc,
          (row.iva8 || 0) * tc,
          (row.iva16 || 0) * tc,
          (row.totaltrasladados || 0) * tc,
          (row.retISR || 0) * tc,
          (row.retIVA || 0) * tc,
          (row.descuento || 0) * tc,
          (row.total || 0) * tc,
          row.Moneda,
          row.Movimiento,
          transformarTipoCFDI(row.TipoComprobante),
          transformarTipoPago(row.TipoPago),
          row.MetodoPago,
          row.UsoCFDI
        ]);

        acumular(totales[mes][tipo], row, tc);
      });

      req.on('error', async err => {
        try { await sql.close(); } catch(e){}
        reject(err);
      });

      // Una vez que se han procesado todas las filas de la consulta SQL,
      // se genera el Excel creando hojas solo para los meses que tienen datos,
      req.on('done', async () => {
        try {
          // Procesar cada mes calculado, crear hoja solo si tiene al menos un tipo de dato (INGRESOS, EGRESOS o NOMINA).
          // Use the actual months we collected in buffers (handles dynamic row months).
          const mesesToProcess = Object.keys(buffers).sort();

          mesesToProcess.forEach(m => {
            const hasData = TIPOS.some(tipo => (buffers[m] && buffers[m][tipo] && buffers[m][tipo].length > 0));
            if (!hasData) return;

            const ws = wb.addWorksheet(m);
            sheets[m] = ws;

            // Ajustar el ancho de las columnas a 25////////////////////////////////
            //ws.columns = Array(20).fill({ width: 25 });
            ajustarAnchoColumnas(ws);

            // Escribir el header solo una vez al inicio de la hoja
            escribirEncabezadoRfc(ws, nombreEmpresa);
            ws.addRow([]).commit();

            TIPOS.forEach(tipo => {
              if (!buffers[m] || buffers[m][tipo].length === 0) return;

              writeSectionTitle(ws, tipo);
              writeTableHeaders(ws);

              // Ordenar las filas por fecha (columna 0 está en formato DD/MM/YYYY, convertir a Date para ordenar)
              buffers[m][tipo].sort((a, b) => {
                const dateA = dayjs(a[0], 'DD/MM/YYYY').toDate();
                const dateB = dayjs(b[0], 'DD/MM/YYYY').toDate();
                return dateA - dateB;
              });

              if (tipo === 'GASTOS') {
                // Lógica especial para GASTOS: agrupar por RFC emisor
                const gastosPorRFC = {};
                
                buffers[m][tipo].forEach(row => {
                  const rfcEmisor = row[2]; // RFC Emisor está en la posición 2
                  if (!gastosPorRFC[rfcEmisor]) {
                    gastosPorRFC[rfcEmisor] = {
                      subtotal: 0,
                      iva8: 0,
                      iva16: 0,
                      traslados: 0,
                      retISR: 0,
                      retIVA: 0,
                      descuento: 0,
                      total: 0,
                      rows: []
                    };
                  }
                  
                  // Acumular totales por RFC emisor
                  //Aqui se va sumando toda la las filas que tienen el mismo RFC
                  gastosPorRFC[rfcEmisor].rows.push(row);
                  gastosPorRFC[rfcEmisor].subtotal += row[6] || 0;
                  gastosPorRFC[rfcEmisor].iva8 += row[7] || 0;
                  gastosPorRFC[rfcEmisor].iva16 += row[8] || 0;
                  gastosPorRFC[rfcEmisor].traslados += row[9] || 0;
                  gastosPorRFC[rfcEmisor].retISR += row[10] || 0;
                  gastosPorRFC[rfcEmisor].retIVA += row[11] || 0;
                  gastosPorRFC[rfcEmisor].descuento += row[12] || 0;
                  gastosPorRFC[rfcEmisor].total += row[13] || 0;
                });

                // Escribir filas de datos y totales por RFC
                Object.keys(gastosPorRFC).forEach(rfc => {
                  const grupo = gastosPorRFC[rfc];

                  // Escribir las filas de datos del grupo 
                  grupo.rows.forEach(r => {
                    const dataRow = ws.addRow(r);
                    
                    // Agregar bordes y formato de moneda a todas las celdas
                    dataRow.eachCell((c, colIndex) => {
                      excelDecorate('BORDES', dataRow, null);
                      if (colIndex >= 7 && colIndex <= 14) {
                        c.numFmt = '"$"#,##0.00';
                      }
                    });
                    
                    // Si el tipo de pago es efectivo (posición 17), colorear la fila de amarillo
                    if (r[17] === 'Efectivo') {
                      dataRow.eachCell(c => {
                        excelDecorate('RELLENARFONDO', dataRow, c.col, null, 'AMARILLO');
                      });
                    }
                    dataRow.commit();
                  });
                  
                  // Escribir fila de total para este RFC (ocupando desde fecha hasta Régimen Fiscal Receptor)
                  //Aqui se muestra en el excel el total por RFC
                  const totalRow = ws.addRow([
                    `TOTAL: ${rfc}`, '', '', '', '','', // Ocupa las primeras 5 columnas (Fecha, UUID, RFC Emisor, Régimen Fiscal Emisor, RFC Receptor)
                    grupo.subtotal,
                    grupo.iva8,
                    grupo.iva16,
                    grupo.traslados,
                    grupo.retISR,
                    grupo.retIVA,
                    grupo.descuento,
                    grupo.total,
                    '', '', '', '', '', ''
                  ]);
                  
                 
                  
                  // Merge cells para que "TOTAL RFC" ocupe desde la columna 1 hasta la 5
                  ws.mergeCells(totalRow.number, 1, totalRow.number, 5);
                  
                  ////////////estilo del excel////////////////////
                  totalRow.font = { bold: true };
                  
                  
                 totalRow.eachCell((c, colIndex) => {
                  excelDecorate('BORDES', totalRow, null);
                  excelDecorate('RELLENARFONDO', totalRow, c.col, null, 'GRISCLARO');
                  excelDecorate('RECARGARDERECHA', totalRow, null, null);
                    if (colIndex >= 7 && colIndex <= 14) {
                      c.numFmt = '"$"#,##0.00';
                    }
                  });
                  totalRow.commit();
                });
              } else {
                // Para INGRESOS y GASTOS - NOMINA, escribir normalmente
                buffers[m][tipo].forEach(r => {
                  const dataRow = ws.addRow(r);
                  
                  // Agregar bordes y formato de moneda a todas las celdas
                  dataRow.eachCell((c, colIndex) => {
                    excelDecorate('BORDES', dataRow, null);
                    if (colIndex >= 7 && colIndex <= 14) {
                      c.numFmt = '"$"#,##0.00';
                    }
                  });
                  
                  if (r[17] === 'Efectivo') {
                    dataRow.eachCell(c => {
                      excelDecorate('RELLENARFONDO', c, c.col, null, 'AMARILLO');
                    });
                  }
                  dataRow.commit();
                });
              }
              writeTotales(ws, tipo, totales[m][tipo]);
            });


            // Agregar fila TOTAL GENERAL MES sumando los tres tipos
            const tIn = totales[m]['INGRESOS'] || {};
            const tGa = totales[m]['GASTOS'] || {};
            const tNo = totales[m]['GASTOS - NOMINA'] || {};
            const totalGeneral = {
              subtotal: (tIn.subtotal || 0) + (tGa.subtotal || 0) + (tNo.subtotal || 0),
              iva8: (tIn.iva8 || 0) + (tGa.iva8 || 0) + (tNo.iva8 || 0),
              iva16: (tIn.iva16 || 0) + (tGa.iva16 || 0) + (tNo.iva16 || 0),
              traslados: (tIn.traslados || 0) + (tGa.traslados || 0) + (tNo.traslados || 0),
              retISR: (tIn.retISR || 0) + (tGa.retISR || 0) + (tNo.retISR || 0),
              retIVA: (tIn.retIVA || 0) + (tGa.retIVA || 0) + (tNo.retIVA || 0),
              descuento: (tIn.descuento || 0) + (tGa.descuento || 0) + (tNo.descuento || 0),
              total: (tIn.total || 0) + (tGa.total || 0) + (tNo.total || 0)
            };
            ws.addRow([]).commit(); // Fila vacía para separar visualmente
            const totalGeneralRow = ws.addRow([
              'TOTAL GENERAL MES', '', '', '', '', '',
              totalGeneral.subtotal,
              totalGeneral.iva8,
              totalGeneral.iva16,
              totalGeneral.traslados,
              totalGeneral.retISR,
              totalGeneral.retIVA,
              totalGeneral.descuento,
              totalGeneral.total,
              '', '', '', '', '', ''
            ]);
            ws.mergeCells(totalGeneralRow.number, 1, totalGeneralRow.number, 6);
            totalGeneralRow.font = { bold: true, color: { argb: sacarColor('BLANCO') } };
            totalGeneralRow.eachCell((c, colIndex) => {
              excelDecorate('BORDES', totalGeneralRow, null);
              excelDecorate('RELLENARFONDO', totalGeneralRow, c.col, null, 'GRIS');
              excelDecorate('RECARGARDERECHA', totalGeneralRow, null, null);
              if (colIndex >= 7 && colIndex <= 14) {
                c.numFmt = '"$"#,##0.00';
              }
            });
            totalGeneralRow.commit();
          });

          // Generar la hoja de TOTALES con resúmenes por mes y tipo, solo para meses que tienen hojas creadas.
          const mesesForTotals = Object.keys(totales)
            .sort((a, b) => a.localeCompare(b));
          mesesForTotals.forEach(mes => {
            if (!sheets[mes]) return;
            TIPOS.forEach(tipo => {
              const t = totales[mes] && totales[mes][tipo];
              if (!t || t.total === 0) return;
              writeTotalesMes(wsTotales, mes, tipo, t);
            });
          });

         

          // Sumar todos los ingresos y gastos/gastos-nomina en la hoja de TOTALES
          // Sumar INGRESOS
          let sumaIngresos = {
            subtotal: 0, iva8: 0, iva16: 0, ivaTotal: 0, descuento: 0, retISR: 0, retIVA: 0, retenidos: 0, total: 0
          };
          // Sumar GASTOS y GASTOS - NOMINA
          let sumaGastos = {
            subtotal: 0, iva8: 0, iva16: 0, ivaTotal: 0, descuento: 0, retISR: 0, retIVA: 0, retenidos: 0, total: 0
          };
          mesesForTotals.forEach(mes => {
            const tIng = totales[mes] && totales[mes]['INGRESOS'];
            if (tIng) {
              sumaIngresos.subtotal += tIng.subtotal || 0;
              sumaIngresos.iva8 += tIng.iva8 || 0;
              sumaIngresos.iva16 += tIng.iva16 || 0;
              sumaIngresos.ivaTotal += (tIng.iva8 || 0) + (tIng.iva16 || 0);
              sumaIngresos.descuento += tIng.descuento || 0;
              sumaIngresos.retISR += tIng.retISR || 0;
              sumaIngresos.retIVA += tIng.retIVA || 0;
              sumaIngresos.retenidos += tIng.retenidos || 0;
              sumaIngresos.total += tIng.total || 0;
            }
            const tGas = totales[mes] && totales[mes]['GASTOS'];
            const tNom = totales[mes] && totales[mes]['GASTOS - NOMINA'];
            [tGas, tNom].forEach(t => {
              if (t) {
                sumaGastos.subtotal += t.subtotal || 0;
                sumaGastos.iva8 += t.iva8 || 0;
                sumaGastos.iva16 += t.iva16 || 0;
                sumaGastos.ivaTotal += (t.iva8 || 0) + (t.iva16 || 0);
                sumaGastos.descuento += t.descuento || 0;
                sumaGastos.retISR += t.retISR || 0;
                sumaGastos.retIVA += t.retIVA || 0;
                sumaGastos.retenidos += t.retenidos || 0;
                sumaGastos.total += t.total || 0;
              }
            });
          });
          // Fila vacía para separar
          wsTotales.addRow([]).commit();
          // Fila suma INGRESOS azul
          const sumaIngresosRow = wsTotales.addRow([
            '', 'TOTAL INGRESOS',
            sumaIngresos.subtotal,
            sumaIngresos.iva8,
            sumaIngresos.iva16,
            sumaIngresos.ivaTotal,
            sumaIngresos.descuento,
            sumaIngresos.retISR,
            sumaIngresos.retIVA,
            sumaIngresos.retenidos,
            sumaIngresos.total
          ]);
          sumaIngresosRow.font = { bold: true, color: { argb: sacarColor('BLANCO') } };
          sumaIngresosRow.eachCell((c, colIndex) => {
            excelDecorate('BORDES', sumaIngresosRow, null);
            excelDecorate('RELLENARFONDO', sumaIngresosRow, c.col, null, 'AZUL');
            if (colIndex >= 3 && colIndex <= 11) {
              c.numFmt = '"$"#,##0.00';
            }
          });
          sumaIngresosRow.commit();
          // Fila suma GASTOS y GASTOS-NOMINA gris
          const sumaGastosRow = wsTotales.addRow([
            '', 'TOTAL GASTOS Y NOMINA',
            sumaGastos.subtotal,
            sumaGastos.iva8,
            sumaGastos.iva16,
            sumaGastos.ivaTotal,
            sumaGastos.descuento,
            sumaGastos.retISR,
            sumaGastos.retIVA,
            sumaGastos.retenidos,
            sumaGastos.total
          ]);
          sumaGastosRow.font = { bold: true, color: { argb: sacarColor('BLANCO') } };
          sumaGastosRow.eachCell((c, colIndex) => {
            excelDecorate('BORDES', sumaGastosRow, null);
            excelDecorate('RELLENARFONDO', sumaGastosRow, c.col, null, 'GRIS');
            if (colIndex >= 3 && colIndex <= 11) {
              c.numFmt = '"$"#,##0.00';
            }
          });
          sumaGastosRow.commit();

          // fin de suma de los TOTALES
          
          if (retencionesRows.length > 0) {
            const wsRet = wb.addWorksheet('RETENCIONES');
          
            wsRet.columns = [
              { width: 15 },
              { width: 20 },
              { width: 15 },
              { width: 20 },
              { width: 20 },
              { width: 14 },
              { width: 14 },
              { width: 14 },
              { width: 16 },
              { width: 14 },
              { width: 14 },
              { width: 16 },
              { width: 14 },
              { width: 14 },
              { width: 14 }
            ];
          
            escribirEncabezadoRfc(wsRet, nombreEmpresa);
            wsRet.addRow([]).commit();
          
            const header = wsRet.addRow([
              'RFC',
              'Regimen Emisor',
              'Regimen Receptor',
              'Clasificacion',
              'SubTotal',
              'IVA 8%',
              'IVA 16%',
              'Total Trasladados',
              'Retencion ISR',
              'Retencion IVA',
              'Retencion Total',
              'Descuento',
              'Total',
              'Mes'
            ]);
          
            header.font = { bold: true };
            excelDecorate('BORDES', header, null);
            excelDecorate('CENTRAR', header, null);
            header.commit();
          
            retencionesRows.forEach(r => {
              const rowExcel = wsRet.addRow(r);
              rowExcel.eachCell((c, colIndex) => {
                excelDecorate('BORDES', rowExcel, null);
                if (colIndex >= 6 && colIndex <= 14) {
                  c.numFmt = '"$"#,##0.00';
                }
              });
              rowExcel.commit();
            });
          }


          await wb.commit();
          try { await sql.close(); } catch(e){}
          resolve();
        } catch (err) {
          try { await sql.close(); } catch(e){}
          reject(err);
        }
      });
    } catch (err) {
      try { sql.close().catch(()=>{}); } catch(e){}
      reject(err);
    }
  });
}

module.exports = { generarExcel, generarExcelStream };