// Arma los Estados Financieros (principales ingresos/egresos por concepto) a
// partir de los CFDIs subidos, replicando la agregación que hace la app desde la
// base de datos (agrupa por ClaveProdServ, IVA proporcional al subtotal, top 20
// por importe). Se usa cuando el usuario tiene cuenta pero aún no configura su
// e.firma. Corre en el navegador.
import type { CfdiRow } from './cfdi-xml'
import type { ConceptoRow } from './facturas-query'

interface Acc {
  descripcion: string
  claveProdServ: string
  cantidad: number
  importe: number
  iva8: number
  iva16: number
  uuids: Set<string>
}

function inPeriod(fecha: string, year: number, month: number): boolean {
  if (!fecha || fecha.length < 7) return false
  return Number(fecha.slice(0, 4)) === year && Number(fecha.slice(5, 7)) === month
}

// Suma las partidas de un CFDI a los acumuladores, con IVA repartido en proporción
// al subtotal del comprobante (igual que la consulta SQL de la app).
function accumulate(map: Map<string, Acc>, r: CfdiRow): void {
  const tc = r.tipoCambio || 1
  const subtotal = r.subtotal || 0
  // Si el CFDI no trae partidas, se usa una sintética con el subtotal completo.
  const conceptos = r.conceptos.length > 0
    ? r.conceptos
    : [{ descripcion: '(Sin concepto registrado)', claveProdServ: '', cantidad: 0, importe: subtotal }]

  for (const c of conceptos) {
    const importeBase = c.importe || 0
    const share = subtotal > 0 ? importeBase / subtotal : 0
    const key = c.claveProdServ || ''
    const cur = map.get(key) ?? {
      descripcion: c.descripcion || 'Sin descripción SAT',
      claveProdServ: key,
      cantidad: 0, importe: 0, iva8: 0, iva16: 0,
      uuids: new Set<string>(),
    }
    if (!cur.descripcion && c.descripcion) cur.descripcion = c.descripcion
    cur.cantidad += c.cantidad || 0
    cur.importe += importeBase * tc
    cur.iva8 += share * r.iva8 * tc
    cur.iva16 += share * r.iva16 * tc
    if (r.uuid) cur.uuids.add(r.uuid)
    map.set(key, cur)
  }
}

function finalize(map: Map<string, Acc>, limit: number): ConceptoRow[] {
  return [...map.values()]
    .map((a) => ({
      descripcion: a.descripcion,
      claveProdServ: a.claveProdServ,
      cantidad: Number(a.cantidad.toFixed(2)),
      importe: Number(a.importe.toFixed(2)),
      iva8: Number(a.iva8.toFixed(2)),
      iva16: Number(a.iva16.toFixed(2)),
      numFacturas: a.uuids.size,
    }))
    .sort((x, y) => y.importe - x.importe)
    .slice(0, limit)
}

/**
 * Construye los conceptos de ingresos y egresos del periodo (year/month) para el
 * RFC del cliente, a partir de los CFDIs subidos. Devuelve hasta `limit` conceptos
 * por sección (20 por defecto, igual que la vista de la app).
 */
export function buildEfFromCfdis(
  rows: CfdiRow[],
  clientRfc: string,
  year: number,
  month: number,
  limit = 20,
): { ingresos: ConceptoRow[]; egresos: ConceptoRow[] } {
  const rfc = (clientRfc || '').toUpperCase()
  const ingresosMap = new Map<string, Acc>()
  const egresosMap = new Map<string, Acc>()

  for (const r of rows) {
    if (!inPeriod(r.fecha, year, month)) continue
    const esEmisor = !!rfc && r.rfcEmisor === rfc
    const esReceptor = !!rfc && r.rfcReceptor === rfc

    // Ingresos: facturas emitidas (I) + notas de crédito recibidas (E).
    if ((r.tipo === 'I' && esEmisor) || (r.tipo === 'E' && esReceptor)) {
      accumulate(ingresosMap, r)
    }
    // Egresos: facturas recibidas (I) + notas de crédito emitidas (E).
    else if ((r.tipo === 'I' && esReceptor) || (r.tipo === 'E' && esEmisor)) {
      accumulate(egresosMap, r)
    }
  }

  return { ingresos: finalize(ingresosMap, limit), egresos: finalize(egresosMap, limit) }
}
