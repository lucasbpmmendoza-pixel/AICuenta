// Convierte los CFDIs parseados (de los XML que sube el usuario en la demo) a las
// MISMAS estructuras que la app arma desde la base de datos, para poder reutilizar
// las tablas reales de Facturas EN PANTALLA (Ingresos/Egresos/Nómina/Retenciones/
// Pagos/Flujo/Notas de crédito). La descarga es otra cosa: un Excel plano.
import type { CfdiRow } from './cfdi-xml'
import type {
  IngresoCFDI, EgresoCFDI, NominaCFDI, RetencionCFDI, PagoRow, NotaCreditoRow, flujoRow,
} from './facturas-query'

export interface FacturasXmlData {
  ingresos: IngresoCFDI[]
  egresos: EgresoCFDI[]
  nomina: NominaCFDI[]
  retenciones: RetencionCFDI[]
  pagos: PagoRow[]
  notas: NotaCreditoRow[]
  flujo: flujoRow[]
}

const d = (s: string): Date => new Date(s)

function mapIngreso(r: CfdiRow, totalMXN: number): IngresoCFDI {
  return {
    UUID: r.uuid, Serie: r.serie, Folio: r.folio, Fecha: d(r.fecha), Status: 'Vigente',
    Version: r.version, RFC_Receptor: r.rfcReceptor, RazonSocialReceptor: r.nombreReceptor,
    UsoCFDI: r.usoCFDI, MetodoPago: r.metodoPago, TipoPago: r.formaPago, Moneda: r.moneda,
    tipoCambio: r.tipoCambio, Subtotal: r.subtotal, Descuento: r.descuento,
    BaseIVA16: 0, BaseIVA8: 0, BaseIVA0: 0, BaseIVAExento: 0,
    TotalTrasladadoIVADieciseis: r.iva16, TotalTrasladadoIVAOcho: r.iva8,
    TotalTrasladadoIVACero: r.iva0, TotalTrasladadoIVAExento: 0,
    TotalTrasladadoIEPS: r.iepsTrasladado, TotalTrasladado: r.totalTraslados,
    TotalRetenidoISR: r.retIsr, TotalRetenidoIVA: r.retIva, TotalRetenidoIEPS: r.retIeps,
    TotalRetenidos: r.retIsr + r.retIva + r.retIeps,
    Total: r.total, Total_MXN: totalMXN, RegimenFiscal: r.regimenEmisor, LugarExpedicion: '',
    Movimiento: 'INGRESO',
  }
}

function mapNomina(r: CfdiRow, totalMXN: number): NominaCFDI {
  return {
    UUID: r.uuid, TipoNomina: 'Nómina', Fecha: d(r.fecha), Status: 'Vigente',
    RFC_Emisor: r.rfcEmisor, RazonSocialEmisor: r.nombreEmisor,
    RFC_Receptor: r.rfcReceptor, RazonSocialReceptor: r.nombreReceptor,
    Moneda: r.moneda, tipoCambio: r.tipoCambio, Subtotal: r.subtotal, Descuento: r.descuento,
    TotalRetenidoISR: r.retIsr, TotalRetenidoIVA: r.retIva, Total: r.total, Total_MXN: totalMXN,
    LugarExpedicion: '',
  }
}

function mapNota(r: CfdiRow): NotaCreditoRow {
  return {
    uuid: r.uuid, fecha: d(r.fecha), RFC_emisor: r.rfcEmisor, RegimenFiscal: r.regimenEmisor,
    RFC_receptor: r.rfcReceptor, RegimenFiscalReceptor: '',
    subtotal: r.subtotal, iva8: r.iva8, iva16: r.iva16, totaltrasladados: r.totalTraslados,
    retISR: r.retIsr, retIVA: r.retIva, totalretenidos: r.retIsr + r.retIva + r.retIeps,
    descuento: r.descuento, total: r.total, TipoPago: r.formaPago, Moneda: r.moneda,
    tipoCambio: r.tipoCambio, TipoComprobante: 'E', MetodoPago: r.metodoPago,
  }
}

function mapPago(r: CfdiRow): PagoRow {
  return {
    uuid_pago: r.uuid, fechaEmision: d(r.fecha), fechaPago: d(r.pagoFecha || r.fecha),
    forma_pago: r.pagoForma, moneda_pago: r.pagoMoneda || r.moneda, tipoCambio: r.tipoCambio,
    total_pago: r.pagoMonto, uuid_relacionado: r.pagoUuidRelacionado,
    moneda_docto: r.pagoMoneda || r.moneda, numParcialidad: r.pagoNumParcialidad,
    saldo_anterior: r.pagoSaldoAnterior, saldo_pagado: r.pagoSaldoPagado,
    saldo_insoluto: r.pagoSaldoInsoluto, base: 0, impuesto: 0, tipo_factor: '', tasa_o_cuota: 0,
    importe: 0, objetoImpuesto: '', RFC_emisor: r.rfcEmisor, RFC_receptor: r.rfcReceptor,
  }
}

function mapRetencion(r: CfdiRow, rfc: string, totalMXN: number): RetencionCFDI {
  const tc = r.tipoCambio || 1
  return {
    UUID: r.uuid, Direccion: (!rfc || r.rfcEmisor === rfc) ? 'Emitida' : 'Recibida',
    TipoComprobante: 'R', Fecha: d(r.fecha), Status: 'Vigente',
    RFC_Emisor: r.rfcEmisor, RazonSocialEmisor: r.nombreEmisor,
    RFC_Receptor: r.rfcReceptor, RazonSocialReceptor: r.nombreReceptor,
    Moneda: r.moneda, tipoCambio: r.tipoCambio, Total: r.total, Total_MXN: totalMXN,
    TotalRetenidoISR: r.retIsr, TotalRetenidoIVA: r.retIva, TotalRetenidoIEPS: r.retIeps,
    TotalRetenidos: r.retIsr + r.retIva + r.retIeps,
    ISR_MXN: r.retIsr * tc, IVA_Ret_MXN: r.retIva * tc,
  }
}

function mapFlujoPago(r: CfdiRow, rfc: string): flujoRow {
  return {
    uuid: r.uuid, fuente: 'Complemento P', fechaEmision: d(r.fecha),
    fechaPago: r.pagoFecha ? d(r.pagoFecha) : null, uuidDocumentoRelacionado: r.pagoUuidRelacionado,
    RFC_emisor: r.rfcEmisor, RazonSocialEmisor: r.nombreEmisor,
    RFC_receptor: r.rfcReceptor, RazonSocialReceptor: r.nombreReceptor,
    formaPago: r.pagoForma, moneda: r.pagoMoneda || r.moneda, tipoCambio: r.tipoCambio,
    subtotal: 0, importe_pagado: r.pagoMonto, tasa_o_cuota: 0, importe_impuesto: 0,
    retISR: 0, retIVA: 0, total: r.pagoMonto, iva: 0,
    movimiento: (!rfc || r.rfcEmisor === rfc) ? 'INGRESO' : 'EGRESO',
  }
}

function mapFlujoPue(r: CfdiRow): flujoRow {
  return {
    uuid: r.uuid, fuente: 'Factura PUE', fechaEmision: d(r.fecha), fechaPago: null,
    uuidDocumentoRelacionado: '', RFC_emisor: r.rfcEmisor, RazonSocialEmisor: r.nombreEmisor,
    RFC_receptor: r.rfcReceptor, RazonSocialReceptor: r.nombreReceptor,
    formaPago: r.formaPago, moneda: r.moneda, tipoCambio: r.tipoCambio,
    subtotal: r.subtotal, importe_pagado: r.total, tasa_o_cuota: 0, importe_impuesto: r.iva16 + r.iva8,
    retISR: r.retIsr, retIVA: r.retIva, total: r.total, iva: r.iva16 + r.iva8, movimiento: 'INGRESO',
  }
}

/**
 * Clasifica los CFDIs como lo hace la app desde la BD, para el RFC del cliente:
 * ingresos (emitidos), egresos (recibidos, agregados por proveedor), nómina,
 * retenciones, pagos, notas de crédito y flujo de efectivo (pagos + facturas PUE).
 */
export function buildFacturasFromCfdis(rows: CfdiRow[], clientRfc: string): FacturasXmlData {
  const rfc = (clientRfc || '').toUpperCase()
  const ingresos: IngresoCFDI[] = []
  const nomina: NominaCFDI[] = []
  const retenciones: RetencionCFDI[] = []
  const pagos: PagoRow[] = []
  const notas: NotaCreditoRow[] = []
  const flujo: flujoRow[] = []
  const egresosMap = new Map<string, EgresoCFDI>()

  for (const r of rows) {
    const tc = r.tipoCambio || 1
    const totalMXN = r.total * tc
    const esEmisor = !rfc || r.rfcEmisor === rfc
    const esReceptor = !!rfc && r.rfcReceptor === rfc

    if (r.tipo === 'I' && esEmisor) {
      ingresos.push(mapIngreso(r, totalMXN))
      if (r.metodoPago === 'PUE') flujo.push(mapFlujoPue(r))
    } else if (r.tipo === 'I' && esReceptor) {
      // Egreso (gasto recibido): se agrega por proveedor, como en la BD.
      const cur = egresosMap.get(r.rfcEmisor) ?? {
        RFC_Emisor: r.rfcEmisor, RazonSocialEmisor: r.nombreEmisor,
        NumFacturas: 0, Vigentes: 0, Canceladas: 0,
        Total_MXN: 0, IVA_MXN: 0, ISR_Retenido_MXN: 0, IVA_Retenido_MXN: 0, IEPS_MXN: 0,
      }
      cur.NumFacturas += 1
      cur.Vigentes += 1
      cur.Total_MXN += totalMXN
      cur.IVA_MXN += (r.iva16 + r.iva8) * tc
      cur.ISR_Retenido_MXN += r.retIsr * tc
      cur.IVA_Retenido_MXN += r.retIva * tc
      cur.IEPS_MXN += r.iepsTrasladado * tc
      if (!cur.RazonSocialEmisor) cur.RazonSocialEmisor = r.nombreEmisor
      egresosMap.set(r.rfcEmisor, cur)
    } else if (r.tipo === 'N') {
      nomina.push(mapNomina(r, totalMXN))
    } else if (r.tipo === 'E') {
      notas.push(mapNota(r))
    } else if (r.tipo === 'P') {
      pagos.push(mapPago(r))
      flujo.push(mapFlujoPago(r, rfc))
    } else if (r.tipo === 'R') {
      retenciones.push(mapRetencion(r, rfc, totalMXN))
    }
  }

  return { ingresos, egresos: [...egresosMap.values()], nomina, retenciones, pagos, notas, flujo }
}
