// Arma los datos del Dashboard (mismas gráficas que consume DashboardCharts) a
// partir de los CFDIs que el usuario subió en "Crea tus cuadros". Se usa cuando
// el usuario tiene cuenta pero todavía no configura su e.firma: sus XML alimentan
// el Dashboard en vez de leer de la base de datos. Todo corre en el navegador.
import type { CfdiRow } from './cfdi-xml'
import type { DashboardData } from '@/app/components/DashboardCharts'

// Etiquetas de régimen fiscal (SAT). Solo las más comunes; el resto cae a genérico.
const REGIMEN_LABELS: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'RESICO Personas Físicas',
  '626': 'Régimen Simplificado de Confianza',
}

// Tarifa de referencia por régimen (para el selector de ISR del dashboard).
const REGIMEN_RATE_HINT: Record<string, string> = {
  '601': '30%', '612': '30%', '606': '10%', '621': '10%',
  '625': '1% a 2.5%', '626': '1%', '622': '21%',
}

function regimenLabel(code: string): string {
  return REGIMEN_LABELS[code] ?? 'Provisional mensual'
}

function inPeriod(fecha: string, year: number, month: number): boolean {
  if (!fecha || fecha.length < 7) return false
  return Number(fecha.slice(0, 4)) === year && Number(fecha.slice(5, 7)) === month
}

// Acumulador para los "top N" por contraparte o concepto.
function topN<T extends string>(map: Map<T, number>, n: number): { key: T; monto: number }[] {
  return [...map.entries()]
    .map(([key, monto]) => ({ key, monto: Number(monto.toFixed(2)) }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n)
}

/**
 * Construye DashboardData para el RFC del cliente y el periodo (year/month) dados,
 * a partir de los CFDIs subidos. Los CFDIs sin fecha del periodo se ignoran.
 */
export function buildDashboardFromCfdis(
  rows: CfdiRow[],
  clientRfc: string,
  year: number,
  month: number,
): DashboardData {
  const rfc = (clientRfc || '').toUpperCase()

  let ingresosTotal = 0, ingresosCount = 0, ivaTotal = 0, isrRetenido = 0, ivaRetenido = 0
  let egresosTotal = 0, egresosCount = 0
  let emitidos = 0, recibidos = 0
  let nominaCount = 0, nominaIsr = 0, nominaImss = 0

  const clientes = new Map<string, number>()
  const proveedores = new Map<string, number>()
  const conceptosIngresos = new Map<string, number>()
  const conceptosEgresos = new Map<string, number>()
  const regimenCount = new Map<string, number>()

  for (const r of rows) {
    if (!inPeriod(r.fecha, year, month)) continue
    const tc = r.tipoCambio || 1
    const totalMXN = r.total * tc
    const esEmisor = !!rfc && r.rfcEmisor === rfc
    const esReceptor = !!rfc && r.rfcReceptor === rfc

    if (esEmisor) emitidos++
    if (esReceptor) recibidos++

    if (r.tipo === 'I' && esEmisor) {
      ingresosTotal += totalMXN
      ingresosCount++
      ivaTotal += (r.iva16 + r.iva8) * tc
      isrRetenido += r.retIsr * tc
      ivaRetenido += r.retIva * tc
      if (r.regimenEmisor) regimenCount.set(r.regimenEmisor, (regimenCount.get(r.regimenEmisor) ?? 0) + 1)
      const cliente = r.nombreReceptor || r.rfcReceptor || 'Sin nombre'
      clientes.set(cliente, (clientes.get(cliente) ?? 0) + totalMXN)
      for (const c of r.conceptos) {
        const key = c.descripcion || '(Sin concepto)'
        conceptosIngresos.set(key, (conceptosIngresos.get(key) ?? 0) + c.importe * tc)
      }
    } else if (r.tipo === 'I' && esReceptor) {
      egresosTotal += totalMXN
      egresosCount++
      const prov = r.nombreEmisor || r.rfcEmisor || 'Sin nombre'
      proveedores.set(prov, (proveedores.get(prov) ?? 0) + totalMXN)
      for (const c of r.conceptos) {
        const key = c.descripcion || '(Sin concepto)'
        conceptosEgresos.set(key, (conceptosEgresos.get(key) ?? 0) + c.importe * tc)
      }
    } else if (r.tipo === 'N' && esEmisor) {
      nominaCount++
      nominaIsr += r.nominaIsr * tc
      nominaImss += r.nominaImss * tc
    }
  }

  // Régimen fiscal más frecuente entre los CFDIs emitidos por el cliente.
  let regimenFiscal = ''
  let bestRegimen = 0
  for (const [code, count] of regimenCount) {
    if (count > bestRegimen) { bestRegimen = count; regimenFiscal = code }
  }

  // Lista de regímenes para el selector de ISR: el detectado primero + comunes.
  const baseRegimenes = ['601', '612', '625']
  const codes = [regimenFiscal, ...baseRegimenes].filter((c, i, arr) => c && arr.indexOf(c) === i)
  const isrRegimenes = codes.map((code) => ({
    code,
    name: regimenLabel(code),
    rateHint: REGIMEN_RATE_HINT[code] ?? '30%',
  }))

  const round = (n: number) => Number(n.toFixed(2))

  return {
    ingresos: {
      total: round(ingresosTotal),
      count: ingresosCount,
      vigentes: ingresosCount,
      cancelados: 0,
      ivaTotal: round(ivaTotal),
      ivaRetenido: round(ivaRetenido),
      isrRetenido: round(isrRetenido),
      isrEstimado: round(Math.max(ingresosTotal - egresosTotal, 0) * 0.3),
      regimenFiscal,
      regimenLabel: regimenFiscal ? regimenLabel(regimenFiscal) : 'Provisional mensual',
    },
    egresos: {
      total: round(egresosTotal),
      count: egresosCount,
      vigentes: egresosCount,
      cancelados: 0,
    },
    topClientes: topN(clientes, 5).map((x) => ({ nombre: x.key, monto: x.monto })),
    topProveedores: topN(proveedores, 5).map((x) => ({ nombre: x.key, monto: x.monto })),
    topConceptosIngresos: topN(conceptosIngresos, 5).map((x) => ({ concepto: x.key, monto: x.monto })),
    topConceptosEgresos: topN(conceptosEgresos, 5).map((x) => ({ concepto: x.key, monto: x.monto })),
    nominaRetenciones: {
      count: nominaCount,
      isr: round(nominaIsr),
      imss: round(nominaImss),
    },
    conteoCfdi: {
      emitidos,
      recibidos,
      total: emitidos + recibidos,
      cancelados: 0,
    },
    conteoSat: {
      emitidos,
      recibidos,
      total: emitidos + recibidos,
    },
    isrRegimenes,
  }
}
