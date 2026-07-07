// Parser de CFDI (XML) que corre en el navegador. Usado por la herramienta demo
// "Crea tus cuadros gratis": se leen los XMLs localmente, sin subir nada al servidor.
import { XMLParser } from 'fast-xml-parser'

// RFCs genéricos que NO deben tomarse como "RFC del cliente" (público en general /
// operaciones con el extranjero). Aparecen como receptor en muchos CFDIs de retail.
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000'])

// Concepto (partida) de un CFDI. Se usa para armar Estados Financieros y los
// "principales ingresos/gastos" del Dashboard a partir de los XML subidos.
export interface CfdiConcepto {
  descripcion: string
  claveProdServ: string
  cantidad: number
  importe: number
}

export interface CfdiRow {
  archivo: string
  uuid: string
  version: string
  tipoComprobante: string
  fecha: string
  serie: string
  folio: string
  rfcEmisor: string
  nombreEmisor: string
  regimenEmisor: string
  rfcReceptor: string
  nombreReceptor: string
  usoCFDI: string
  moneda: string
  tipoCambio: number
  subtotal: number
  descuento: number
  totalTraslados: number
  totalRetenciones: number
  total: number
  formaPago: string
  metodoPago: string
  // Código crudo del tipo (I/E/N/P/T) para clasificar.
  tipo: string
  // Desglose de impuestos (nivel comprobante).
  iva16: number
  iva8: number
  iva0: number
  iepsTrasladado: number
  retIsr: number
  retIva: number
  retIeps: number
  // Retenciones del complemento de Nómina (Deducciones): ISR e IMSS.
  nominaIsr: number
  nominaImss: number
  // Partidas del CFDI (para Estados Financieros y conceptos del Dashboard).
  conceptos: CfdiConcepto[]
  // Complemento de pago (solo tipo P).
  pagoFecha: string
  pagoMonto: number
  pagoForma: string
  pagoMoneda: string
  pagoNumParcialidad: number
  pagoSaldoAnterior: number
  pagoSaldoPagado: number
  pagoSaldoInsoluto: number
  pagoUuidRelacionado: string
}

// Etiquetas legibles para encabezados de tabla y de Excel.
export const CFDI_COLUMNS: { key: keyof CfdiRow; label: string; numeric?: boolean }[] = [
  { key: 'archivo', label: 'Archivo' },
  { key: 'uuid', label: 'UUID' },
  { key: 'version', label: 'Versión' },
  { key: 'tipoComprobante', label: 'Tipo' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'serie', label: 'Serie' },
  { key: 'folio', label: 'Folio' },
  { key: 'rfcEmisor', label: 'RFC Emisor' },
  { key: 'nombreEmisor', label: 'Nombre Emisor' },
  { key: 'regimenEmisor', label: 'Régimen Emisor' },
  { key: 'rfcReceptor', label: 'RFC Receptor' },
  { key: 'nombreReceptor', label: 'Nombre Receptor' },
  { key: 'usoCFDI', label: 'Uso CFDI' },
  { key: 'moneda', label: 'Moneda' },
  { key: 'tipoCambio', label: 'Tipo Cambio', numeric: true },
  { key: 'subtotal', label: 'Subtotal', numeric: true },
  { key: 'descuento', label: 'Descuento', numeric: true },
  { key: 'totalTraslados', label: 'Impuestos Trasladados', numeric: true },
  { key: 'totalRetenciones', label: 'Impuestos Retenidos', numeric: true },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'formaPago', label: 'Forma Pago' },
  { key: 'metodoPago', label: 'Método Pago' },
]

const TIPO_LABEL: Record<string, string> = {
  I: 'Ingreso',
  E: 'Egreso',
  N: 'Nómina',
  P: 'Pago',
  T: 'Traslado',
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  // Mantener atributos como string: FormaPago "03" o Moneda "MXN" no deben
  // convertirse a número. Los campos numéricos se convierten manualmente.
  parseAttributeValue: false,
  trimValues: true,
})

type XmlNode = Record<string, unknown>

function asNode(v: unknown): XmlNode | null {
  if (!v || typeof v !== 'object') return null
  // fast-xml-parser puede devolver un arreglo cuando el elemento se repite.
  const node = Array.isArray(v) ? v[0] : v
  return node && typeof node === 'object' ? (node as XmlNode) : null
}

// Lee un atributo tolerando variaciones de mayúsculas/minúsculas entre CFDI 3.3 y 4.0.
function attr(node: XmlNode | null, ...names: string[]): string {
  if (!node) return ''
  for (const name of names) {
    const v = node[name]
    if (v !== undefined && v !== null && typeof v !== 'object') return String(v)
  }
  const lowered = names.map((n) => n.toLowerCase())
  for (const key of Object.keys(node)) {
    if (lowered.includes(key.toLowerCase())) {
      const v = node[key]
      if (v !== undefined && v !== null && typeof v !== 'object') return String(v)
    }
  }
  return ''
}

function num(v: string): number {
  if (!v) return 0
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

// Normaliza un nodo (objeto, arreglo o ausente) a un arreglo de nodos.
function nodeArray(v: unknown): XmlNode[] {
  if (v == null) return []
  const arr = Array.isArray(v) ? v : [v]
  const out: XmlNode[] = []
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) out.push(item as XmlNode)
  }
  return out
}

// Desglosa los impuestos a nivel comprobante (Traslados/Retenciones).
function parseImpuestos(imp: XmlNode | null) {
  let iva16 = 0, iva8 = 0, iva0 = 0, iepsTrasladado = 0, retIsr = 0, retIva = 0, retIeps = 0
  if (imp) {
    const traslados = asNode(imp['Traslados'])
    for (const t of nodeArray(traslados?.['Traslado'])) {
      const impuesto = attr(t, 'Impuesto')
      const tasa = num(attr(t, 'TasaOCuota'))
      const importe = num(attr(t, 'Importe'))
      if (impuesto === '002') {
        if (Math.abs(tasa - 0.16) < 0.0001) iva16 += importe
        else if (Math.abs(tasa - 0.08) < 0.0001) iva8 += importe
        else iva0 += importe
      } else if (impuesto === '003') {
        iepsTrasladado += importe
      }
    }
    const retenciones = asNode(imp['Retenciones'])
    for (const r of nodeArray(retenciones?.['Retencion'])) {
      const impuesto = attr(r, 'Impuesto')
      const importe = num(attr(r, 'Importe'))
      if (impuesto === '001') retIsr += importe
      else if (impuesto === '002') retIva += importe
      else if (impuesto === '003') retIeps += importe
    }
  }
  return { iva16, iva8, iva0, iepsTrasladado, retIsr, retIva, retIeps }
}

// Lee las partidas (Conceptos > Concepto) del comprobante.
function parseConceptos(comprobante: XmlNode): CfdiConcepto[] {
  const cont = asNode(comprobante['Conceptos'])
  const out: CfdiConcepto[] = []
  for (const c of nodeArray(cont?.['Concepto'])) {
    out.push({
      descripcion: attr(c, 'Descripcion', 'descripcion'),
      claveProdServ: attr(c, 'ClaveProdServ', 'claveProdServ'),
      cantidad: num(attr(c, 'Cantidad', 'cantidad')),
      importe: num(attr(c, 'Importe', 'importe')),
    })
  }
  return out
}

// Retenciones del complemento de Nómina: ISR (TipoDeduccion 002) e IMSS/seguridad
// social (TipoDeduccion 001). En nómina el ISR no viene en Impuestos del comprobante.
function parseNominaDeducciones(comprobante: XmlNode): { isr: number; imss: number } {
  let isr = 0, imss = 0
  for (const c of nodeArray(comprobante['Complemento'])) {
    const nom = asNode(c['Nomina'])
    if (!nom) continue
    const ded = asNode(nom['Deducciones'])
    for (const d of nodeArray(ded?.['Deduccion'])) {
      const tipo = attr(d, 'TipoDeduccion', 'tipoDeduccion').replace(/^0+/, '')
      const importe = num(attr(d, 'Importe', 'importe'))
      if (tipo === '2') isr += importe
      else if (tipo === '1') imss += importe
    }
  }
  return { isr, imss }
}

const EMPTY_PAGO = {
  pagoFecha: '', pagoMonto: 0, pagoForma: '', pagoMoneda: '',
  pagoNumParcialidad: 0, pagoSaldoAnterior: 0, pagoSaldoPagado: 0,
  pagoSaldoInsoluto: 0, pagoUuidRelacionado: '',
}

// Extrae un resumen del complemento de pago (tipo P): fecha, monto, forma y el
// primer documento relacionado (parcialidad y saldos), como lo muestra la app.
function parsePagoComplemento(comprobante: XmlNode) {
  for (const c of nodeArray(comprobante['Complemento'])) {
    const pagos = asNode(c['Pagos'])
    if (!pagos) continue
    const lista = nodeArray(pagos['Pago'])
    const totales = asNode(pagos['Totales'])
    const first = lista[0] ?? null
    const docto = first ? nodeArray(first['DoctoRelacionado'])[0] ?? null : null
    const monto =
      num(attr(totales, 'MontoTotalPagos')) ||
      lista.reduce((s, p) => s + num(attr(p, 'Monto')), 0)
    return {
      pagoFecha: attr(first, 'FechaPago', 'fechaPago'),
      pagoMonto: monto,
      pagoForma: attr(first, 'FormaDePagoP', 'formaDePagoP'),
      pagoMoneda: attr(first, 'MonedaP', 'monedaP') || 'MXN',
      pagoNumParcialidad: num(attr(docto, 'NumParcialidad', 'numParcialidad')),
      pagoSaldoAnterior: num(attr(docto, 'ImpSaldoAnt', 'impSaldoAnt')),
      pagoSaldoPagado: num(attr(docto, 'ImpPagado', 'impPagado')),
      pagoSaldoInsoluto: num(attr(docto, 'ImpSaldoInsoluto', 'impSaldoInsoluto')),
      pagoUuidRelacionado: attr(docto, 'IdDocumento', 'idDocumento'),
    }
  }
  return { ...EMPTY_PAGO }
}

// Parsea un CFDI de Retenciones e información de pagos (raíz distinta a Comprobante).
function parseRetencion(ret: XmlNode, archivo: string): CfdiRow {
  const emisor = asNode(ret['Emisor'])
  const receptorRaw = asNode(ret['Receptor'])
  const nacional = asNode(receptorRaw?.['Nacional']) ?? receptorRaw
  const totales = asNode(ret['Totales'])

  let retIsr = 0, retIva = 0, retIeps = 0
  for (const im of nodeArray(totales?.['ImpRetenidos'])) {
    const impuesto = attr(im, 'ImpuestoRet', 'impuestoRet').replace(/^0+/, '')
    const monto = num(attr(im, 'MontoRet', 'montoRet'))
    if (impuesto === '1' || impuesto === '01') retIsr += monto
    else if (impuesto === '2' || impuesto === '02') retIva += monto
    else if (impuesto === '3' || impuesto === '03') retIeps += monto
  }
  const montoTotRet = num(attr(totales, 'MontoTotRet', 'montoTotRet')) || retIsr + retIva + retIeps
  const total = num(attr(totales, 'MontoTotOperacion', 'montoTotOperacion')) || montoTotRet

  return {
    archivo,
    uuid: findUuid(ret),
    version: attr(ret, 'Version', 'version'),
    tipoComprobante: 'Retención',
    fecha: attr(ret, 'FechaExp', 'fechaExp', 'Fecha', 'fecha'),
    serie: '', folio: '',
    rfcEmisor: attr(emisor, 'RfcE', 'RFCEmisor', 'rfc').toUpperCase(),
    nombreEmisor: attr(emisor, 'NomDenRazSocE', 'Nombre', 'nombre'),
    regimenEmisor: '',
    rfcReceptor: attr(nacional, 'RfcR', 'RFCRecep', 'rfc').toUpperCase(),
    nombreReceptor: attr(nacional, 'NomDenRazSocR', 'Nombre', 'nombre'),
    usoCFDI: '',
    moneda: 'MXN', tipoCambio: 1,
    subtotal: 0, descuento: 0, totalTraslados: 0, totalRetenciones: montoTotRet,
    total,
    formaPago: '', metodoPago: '',
    tipo: 'R',
    iva16: 0, iva8: 0, iva0: 0, iepsTrasladado: 0,
    retIsr, retIva, retIeps,
    nominaIsr: 0, nominaImss: 0,
    conceptos: [],
    ...EMPTY_PAGO,
  }
}

// Busca el TimbreFiscalDigital dentro de Complemento (puede ser objeto o arreglo,
// y contener varios complementos hermanos).
function findUuid(comprobante: XmlNode): string {
  const complementoRaw = comprobante['Complemento']
  if (!complementoRaw) return ''
  const complementos = Array.isArray(complementoRaw) ? complementoRaw : [complementoRaw]
  for (const c of complementos) {
    const node = asNode(c)
    if (!node) continue
    const tfd = asNode(node['TimbreFiscalDigital'])
    if (tfd) {
      const uuid = attr(tfd, 'UUID', 'Uuid')
      if (uuid) return uuid
    }
  }
  return ''
}

/**
 * Parsea un XML de CFDI a una fila plana. Devuelve `null` si el XML no es un
 * comprobante válido (no tiene raíz Comprobante).
 */
export function parseCfdiXml(xml: string, archivo: string): CfdiRow | null {
  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch {
    return null
  }
  const root = asNode(doc)
  const comprobante = asNode(root?.['Comprobante'])
  if (!comprobante) {
    // CFDI de Retenciones e información de pagos (raíz distinta a Comprobante).
    const ret = asNode(root?.['Retenciones'])
    return ret ? parseRetencion(ret, archivo) : null
  }

  const emisor = asNode(comprobante['Emisor'])
  const receptor = asNode(comprobante['Receptor'])
  const impuestos = asNode(comprobante['Impuestos'])

  const tipo = attr(comprobante, 'TipoDeComprobante', 'tipoDeComprobante').toUpperCase()
  const tipoCambio = num(attr(comprobante, 'TipoCambio', 'tipoCambio')) || 1
  const imp = parseImpuestos(impuestos)
  const pago = tipo === 'P' ? parsePagoComplemento(comprobante) : EMPTY_PAGO
  const nomina = tipo === 'N' ? parseNominaDeducciones(comprobante) : { isr: 0, imss: 0 }

  return {
    archivo,
    uuid: findUuid(comprobante),
    version: attr(comprobante, 'Version', 'version'),
    tipoComprobante: TIPO_LABEL[tipo] ?? tipo,
    fecha: attr(comprobante, 'Fecha', 'fecha'),
    serie: attr(comprobante, 'Serie', 'serie'),
    folio: attr(comprobante, 'Folio', 'folio'),
    rfcEmisor: attr(emisor, 'Rfc', 'rfc').toUpperCase(),
    nombreEmisor: attr(emisor, 'Nombre', 'nombre'),
    regimenEmisor: attr(emisor, 'RegimenFiscal', 'regimenFiscal'),
    rfcReceptor: attr(receptor, 'Rfc', 'rfc').toUpperCase(),
    nombreReceptor: attr(receptor, 'Nombre', 'nombre'),
    usoCFDI: attr(receptor, 'UsoCFDI', 'usoCFDI'),
    moneda: attr(comprobante, 'Moneda', 'moneda') || 'MXN',
    tipoCambio,
    subtotal: num(attr(comprobante, 'SubTotal', 'subTotal')),
    descuento: num(attr(comprobante, 'Descuento', 'descuento')),
    totalTraslados: num(attr(impuestos, 'TotalImpuestosTrasladados', 'totalImpuestosTrasladados')),
    totalRetenciones: num(attr(impuestos, 'TotalImpuestosRetenidos', 'totalImpuestosRetenidos')),
    total: num(attr(comprobante, 'Total', 'total')),
    formaPago: attr(comprobante, 'FormaPago', 'formaPago'),
    metodoPago: attr(comprobante, 'MetodoPago', 'metodoPago'),
    tipo,
    iva16: imp.iva16,
    iva8: imp.iva8,
    iva0: imp.iva0,
    iepsTrasladado: imp.iepsTrasladado,
    retIsr: imp.retIsr,
    retIva: imp.retIva,
    retIeps: imp.retIeps,
    nominaIsr: nomina.isr,
    nominaImss: nomina.imss,
    conceptos: parseConceptos(comprobante),
    ...pago,
  }
}

/**
 * Detecta el "RFC del cliente" como el RFC más repetido entre emisores y
 * receptores de todos los CFDIs (el RFC del dueño aparece en casi todos los suyos).
 * Ignora RFCs genéricos (público en general / extranjero).
 */
export function detectClientRfc(rows: CfdiRow[]): { rfc: string; nombre: string } | null {
  const counts = new Map<string, number>()
  const names = new Map<string, string>()

  const bump = (rfc: string, nombre: string) => {
    if (!rfc || RFC_GENERICOS.has(rfc)) return
    counts.set(rfc, (counts.get(rfc) ?? 0) + 1)
    if (nombre && !names.get(rfc)) names.set(rfc, nombre)
  }

  for (const r of rows) {
    bump(r.rfcEmisor, r.nombreEmisor)
    bump(r.rfcReceptor, r.nombreReceptor)
  }

  let bestRfc = ''
  let bestCount = 0
  for (const [rfc, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestRfc = rfc
    }
  }
  if (!bestRfc) return null
  return { rfc: bestRfc, nombre: names.get(bestRfc) ?? '' }
}
