const { excelDecorate, sacarColor } = require('./variablesEstaticas');

//Funcion para escribir el RFC en el encabezado
function escribirEncabezadoRfc(ws, nombreEmpresa) {
  // creamos una fila nueva////////////////////////////////////////////////////////////////////
  const row = ws.addRow([nombreEmpresa]);
  //unir las celdas de la fila
   ws.mergeCells(row.number, 1, row.number, 21);
  excelDecorate('UNIRCELDAS', row, 1, 21);
  //altura de la fila
  row.height = 20;
  excelDecorate('TAMANOLETRA', row, 1, 14);
  excelDecorate('CENTRAR', row, 1, null);
  excelDecorate('RELLENARFONDO', row, 1, null, 'GRIS');
  excelDecorate('BORDES', row, null, null);
  excelDecorate('COLORLETRA', row, 1, null, 'BLANCO');
  //confirmar cambios
  row.commit();
}



/////Encabezados de la tabla de los meses
function writeTableHeaders(ws) {
  const r = ws.addRow([
    'Fecha','Folio','Emisor','Régimen Emisor','Receptor',
    'Régimen Receptor','Subtotal','IVA 8%','IVA 16%','Total Trasladados',
    'Retencion ISR','Retencion IVA','Descuento','Total','Moneda','Clasificación',
    'Comprobante','Forma pago','Método Pago','Uso CFDI'
  ]);
  //estetica
  r.font = { bold:true };
  excelDecorate('CENTRAR', r, null, null);
  excelDecorate('BORDES', r, null, null);
  r.commit();
}

function writeTableHeadersPagos(ws) {
  const header = ws.addRow([
    'Fecha Emision',
    'Fecha Pago',
    'UUID Pago',
    'RFC Emisor',
    'RFC Receptor',
    'Forma Pago',
    'Moneda Pago',
    'Tipo Cambio',
    'Total Pago',
    'UUID Documento',
    'Moneda Documento',
    'Num Parcialidad',
    'Saldo Anterior',
    'Importe Pagado',
    'Saldo Insoluto',
    'Base',
    'Impuesto',
    'Tipo Factor',
    'Tasa o Cuota',
    'Importe Impuesto',
    'Objeto Impuesto'
  ]);

  header.font = { bold: true };
  excelDecorate('BORDES', header, null);
  excelDecorate('CENTRAR', header, null);
  header.commit();
}


//tabla de los meses donde se muestran los totales
function writeTotales(ws, tipo, t) {
  ws.addRow([]).commit();

  const r = ws.addRow([
    '', '', '', '', '', 'TOTALES',
    t.subtotal,
    t.iva8,
    t.iva16,
    t.iva8 + t.iva16,
    t.retISR,
    t.retIVA,
    t.descuento,
    t.total
  ]);

  r.font = { bold:true };
  excelDecorate('BORDES', r, null, null);
  
  r.eachCell((c, colIndex) => {
    // Aplicar formato de moneda a las columnas de dinero (índices 7-14, que corresponden a columnas G-N)
    if (colIndex >= 7 && colIndex <= 14) {
      c.numFmt = '"$"#,##0.00';
    }
    excelDecorate('RECARGARDERECHA', r, colIndex, null);
    // Colorear las celdas de totales
    if (colIndex >= 7) {
      c.fill = {
        type:'pattern',
        pattern:'solid',
        fgColor:{
          argb:
            tipo === 'INGRESOS' ? sacarColor('AZUL') :
            tipo === 'GASTOS'  ? sacarColor('GRIS') :
                                  sacarColor('VERDE')
        }
      };
      c.font = { bold:true, color:{argb:sacarColor('BLANCO')} };
    }
  });

  r.commit();
}

//// Ajustar el ancho de las columnas a 25 para los meses////////////////////////////////
function ajustarAnchoColumnas(ws) {
            ws.getColumn(1).width = 13; // Fecha Emision
            ws.getColumn(2).width = 13; // Fecha Pago
            ws.getColumn(3).width = 18; // UUID Pago
            ws.getColumn(4).width = 17; // RFC Emisor
            ws.getColumn(5).width = 16; // RFC Receptor
            ws.getColumn(6).width = 13; // Forma Pago
            ws.getColumn(7).width = 13; // Moneda Pago
            ws.getColumn(8).width = 13; // Tipo Cambio
            ws.getColumn(9).width = 13; // Total Pago
            ws.getColumn(10).width = 18; // UUID Documento
            ws.getColumn(11).width = 13; // Moneda Documento
            ws.getColumn(12).width = 13; // Num Parcialidad
            ws.getColumn(13).width = 13; // Saldo Anterior
            ws.getColumn(14).width = 13; // Importe Pagado
            ws.getColumn(15).width = 13; // Saldo Insoluto
            ws.getColumn(16).width = 10; // Base
            ws.getColumn(17).width = 13; // Impuesto
            ws.getColumn(18).width = 13; // Tipo Factor
            ws.getColumn(19).width = 15; // Tasa o Cuota
            ws.getColumn(20).width = 13; // Importe Impuesto
            ws.getColumn(21).width = 13; // Objeto Impuesto
}

function ajustarAnchoColumnasTotales(ws) {
            ws.getColumn(1).width = 12;
            ws.getColumn(2).width = 26;
            ws.getColumn(3).width = 17;
            ws.getColumn(4).width = 16;
            ws.getColumn(5).width = 15;
            ws.getColumn(6).width = 16;
            ws.getColumn(11).width = 17;
          }

function writeTableHeadersNotasCredito(ws) {
  const r = ws.addRow([
    'Fecha', 'Folio', 'Emisor', 'Régimen Emisor', 'Receptor', 'Régimen Receptor',
    'Subtotal', 'IVA 8%', 'IVA 16%', 'Total Trasladados',
    'Retención ISR', 'Retención IVA', 'Total Retenidos', 'Descuento', 'Total',
    'Forma Pago', 'Moneda', 'Tipo Cambio', 'Tipo Comprobante', 'Método Pago'
  ]);
  r.font = { bold: true };
  excelDecorate('CENTRAR', r, null, null);
  excelDecorate('BORDES', r, null, null);
  r.commit();
}

function ajustarAnchoColumnasNotasCredito(ws) {
  ws.getColumn(1).width = 13;  // Fecha
  ws.getColumn(2).width = 38;  // Folio (UUID)
  ws.getColumn(3).width = 17;  // Emisor
  ws.getColumn(4).width = 17;  // Régimen Emisor
  ws.getColumn(5).width = 17;  // Receptor
  ws.getColumn(6).width = 17;  // Régimen Receptor
  ws.getColumn(7).width = 14;  // Subtotal
  ws.getColumn(8).width = 13;  // IVA 8%
  ws.getColumn(9).width = 13;  // IVA 16%
  ws.getColumn(10).width = 16; // Total Trasladados
  ws.getColumn(11).width = 14; // Retención ISR
  ws.getColumn(12).width = 14; // Retención IVA
  ws.getColumn(13).width = 15; // Total Retenidos
  ws.getColumn(14).width = 13; // Descuento
  ws.getColumn(15).width = 14; // Total
  ws.getColumn(16).width = 12; // Forma Pago
  ws.getColumn(17).width = 10; // Moneda
  ws.getColumn(18).width = 12; // Tipo Cambio
  ws.getColumn(19).width = 17; // Tipo Comprobante
  ws.getColumn(20).width = 13; // Método Pago
}



// Exportar la función para reutilizar en otros módulos
module.exports = { escribirEncabezadoRfc, writeTotales, writeTableHeaders, ajustarAnchoColumnas, ajustarAnchoColumnasTotales, writeTableHeadersPagos, writeTableHeadersNotasCredito, ajustarAnchoColumnasNotasCredito };
