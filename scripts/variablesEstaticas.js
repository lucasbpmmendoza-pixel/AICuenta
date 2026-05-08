/* =========================
Aqui van todas las funciones de estetica de excel   
  
  Colores

========================= */
// Función para obtener el color en formato ARGB
function sacarColor(color) {
  switch (color.toUpperCase()) {
    case 'AZUL':   return 'FF1F4E79';
    case 'GRIS':   return 'FF595959';
    case 'VERDE':  return 'FF2E7D32';
    case 'ROJO':   return 'FFFF0000';
    case 'BLANCO': return 'FFFFFFFF';
    case 'NEGRO': return 'FF000000';
    case 'GRISCLARO': return 'E8E8E8';
    case 'AMARILLO': return 'FFFFFF00';
    case 'AZULCLARO': return 'FFADD8E6';
    default:       return 'FFFFFFFF';
  }
}
/* =========================
   CONSTANTES
========================= */
const MESES = [
 'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
];

const TIPOS = ['INGRESOS','GASTOS','GASTOS - NOMINA'];

/* =========================
    TRANSFORMACIONES
========================= */
function transformarTipoPago(codigo) {
  const tiposPago = {
    '01': 'Efectivo',
    '02': 'Cheque nominativo',
    '03': 'Transferencia',
    '04': 'Tarjeta de crédito',
    '05': 'Monedero electrónico',
    '06': 'Dinero electrónico',
    '08': 'Vales de despensa',
    '12': 'Dación de pago',
    '28': 'Tarjeta de débito',
    '99': 'Otros'
  };
  return tiposPago[codigo] || codigo;
}

function transformarTipoCFDI(codigo) {
  const tiposCFDI = {
    'I': 'Ingreso',
    'N': 'Nómina',
    'E': 'Egreso'
  };
  return tiposCFDI[codigo] || codigo;
}

// Nueva función para decoraciones de Excel
function excelDecorate(funcion, row, valor1, valor2, color) {
   switch (funcion.toUpperCase()) {
    //Color de letra
    case 'COLORLETRA':
      if (row.getCell) {
        return row.getCell(valor1).font = { bold:true, color: { argb: sacarColor(color) } };
      } else {
        return row.font = { bold:true, color: { argb: sacarColor(color) } };
      }
    //Poner negritas y tamaño de letra
    case 'TAMANOLETRA':
      if (row.getCell) {
        return row.getCell(valor1).font = { bold:true, size:valor2 };
      } else {
        return row.font = { bold:true, size:valor2 };
      }
    //Alinear al centro
    case 'CENTRAR':
      if (valor1) {
        if (row.getCell) {
          return row.getCell(valor1).alignment = {
            horizontal:'center',
            vertical:'center',
            wrapText:true
          };
        } else {
          return row.alignment = {
            horizontal:'center',
            vertical:'center',
            wrapText:true
          };
        }
      } else {
        return row.alignment = {
          horizontal:'center',
          vertical:'center',
          wrapText:true
        };
      }

    //Recargar derecha
    case 'RECARGARDERECHA':
      if (valor1) {
        if (row.getCell) {
          return row.getCell(valor1).alignment = {
            horizontal:'right',
            vertical:'center',
            wrapText:true
          };
        } else {
          return row.alignment = {
            horizontal:'right',
            vertical:'center',
            wrapText:true
          };
        }
      } else {
        return row.alignment = {
          horizontal:'right',
          vertical:'center',
          wrapText:true
        };
      }

    //Rellenar fondo de celda
    case 'RELLENARFONDO':
      if (row.getCell) {
        return row.getCell(valor1).fill = {
          type:'pattern',
          pattern:'solid',
          fgColor:{ argb:sacarColor(color) }
        };
      } else {
        return row.fill = {
          type:'pattern',
          pattern:'solid',
          fgColor:{ argb:sacarColor(color) }
        };
      }

    //Agregar bordes a celda
    case 'BORDES':
      if (row.eachCell) {
        return row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      } else {
        return row.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    default:
      return;
  }
}




// Exportar las funciones para reutilizar en otros módulos
module.exports = {excelDecorate, transformarTipoCFDI, transformarTipoPago, sacarColor,  MESES, TIPOS };
