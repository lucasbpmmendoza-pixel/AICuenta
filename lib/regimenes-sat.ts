// Catálogo de regímenes fiscales del SAT (c_RegimenFiscal). Fuente única para el
// selector de ISR del Dashboard, el selector de régimen por RFC y el modo XML.
// rateHint es solo una tarifa de referencia que se muestra junto al nombre.

export type RegimenSat = {
  code: string
  name: string
  rateHint: string
}

export const REGIMENES_SAT: RegimenSat[] = [
  { code: '601', name: 'Régimen General de Ley Personas Morales', rateHint: '30%' },
  { code: '602', name: 'Régimen Simplificado de Ley Personas Morales', rateHint: '30%' },
  { code: '603', name: 'Personas Morales con Fines no Lucrativos', rateHint: '0%' },
  { code: '604', name: 'Régimen de Pequeños Contribuyentes', rateHint: '30%' },
  { code: '605', name: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios', rateHint: '0%' },
  { code: '606', name: 'Régimen de Arrendamiento', rateHint: '20%' },
  { code: '607', name: 'Régimen de Enajenación o Adquisición de Bienes', rateHint: '30%' },
  { code: '608', name: 'Régimen de los Demás Ingresos', rateHint: '30%' },
  { code: '609', name: 'Régimen de Consolidación', rateHint: '30%' },
  { code: '610', name: 'Régimen Residentes en el Extranjero sin Establecimiento Permanente en México', rateHint: '30%' },
  { code: '611', name: 'Régimen de Ingresos por Dividendos (Socios y Accionistas)', rateHint: '10%' },
  { code: '612', name: 'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales', rateHint: '30%' },
  { code: '613', name: 'Régimen Intermedio de las Personas Físicas con Actividades Empresariales', rateHint: '30%' },
  { code: '614', name: 'Régimen de los Ingresos por Intereses', rateHint: '10%' },
  { code: '615', name: 'Régimen de los Ingresos por Obtención de Premios', rateHint: '10%' },
  { code: '616', name: 'Sin Obligaciones Fiscales', rateHint: '0%' },
  { code: '617', name: 'PEMEX', rateHint: '30%' },
  { code: '618', name: 'Régimen Simplificado de Ley Personas Físicas', rateHint: '30%' },
  { code: '619', name: 'Ingresos por la Obtención de Préstamos', rateHint: '0%' },
  { code: '620', name: 'Sociedades Cooperativas de Producción que Optan por Diferir sus Ingresos', rateHint: '30%' },
  { code: '621', name: 'Régimen de Incorporación Fiscal', rateHint: '10%' },
  { code: '622', name: 'Régimen de Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras PM', rateHint: '21%' },
  { code: '623', name: 'Régimen Opcional para Grupos de Sociedades', rateHint: '30%' },
  { code: '624', name: 'Régimen de los Coordinados', rateHint: '30%' },
  { code: '625', name: 'Régimen de las Actividades Empresariales con Ingresos a través de Plataformas Tecnológicas', rateHint: 'retención plataforma' },
  { code: '626', name: 'Régimen Simplificado de Confianza', rateHint: '1% a 2.5%' },
]

export function findRegimenSat(code: string): RegimenSat | undefined {
  return REGIMENES_SAT.find((r) => r.code === code)
}
