// Parser de CFDI (XML) que corre en el navegador. Usado por la herramienta demo
// "Crea tus cuadros gratis": se leen los XMLs localmente, sin subir nada al servidor.
import { XMLParser } from 'fast-xml-parser'

// RFCs genéricos que NO deben tomarse como "RFC del cliente" (público en general /
// operaciones con el extranjero). Aparecen como receptor en muchos CFDIs de retail.
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000'])

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
  if (!comprobante) return null

  const emisor = asNode(comprobante['Emisor'])
  const receptor = asNode(comprobante['Receptor'])
  const impuestos = asNode(comprobante['Impuestos'])

  const tipo = attr(comprobante, 'TipoDeComprobante', 'tipoDeComprobante')
  const tipoCambio = num(attr(comprobante, 'TipoCambio', 'tipoCambio')) || 1

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
