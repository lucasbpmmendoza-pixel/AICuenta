import type {
  ConceptoRow,
  EgresoCFDI,
  FacturasData,
  flujoRow,
  IngresoCFDI,
  NominaCFDI,
  NotaCreditoRow,
  PagoRow,
  RawCFDIExport,
  RetencionCFDI,
} from "@/lib/facturas-query";

const DEMO_RAZONES = [
  "Servicios Demo del Norte SA de CV",
  "Comercial Ficticia del Centro SA de CV",
  "Operadora Muestra del Bajio SA de CV",
  "Laboratorio Ejemplo Fiscal SA de CV",
  "Tecnologia Simulada MX SA de CV",
];

const DEMO_PRODUCTOS = [
  "Consultoria financiera",
  "Licencia anual SaaS",
  "Mantenimiento preventivo",
  "Implementacion de procesos",
  "Capacitacion interna",
  "Soporte especializado",
  "Auditoria operativa",
  "Servicio de analitica",
  "Suscripcion empresarial",
  "Integracion ERP",
];

const DEMO_FORMAS_PAGO = ["01", "03", "04", "28", "99"];
const DEMO_USO_CFDI = ["G03", "D01", "P01", "S01"];

export type DemoRfcOption = {
  id: string;
  rfc: string;
  alias: string;
  fiel: string;
  downloads_enabled: boolean;
  created_at: string;
  last_update: string;
};

export function getDemoRfcs(): DemoRfcOption[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-rfc-1",
      rfc: "DEM010101AAA",
      alias: "Demo Matriz",
      fiel: "demo-fiel-a",
      downloads_enabled: true,
      created_at: now,
      last_update: now,
    },
    {
      id: "demo-rfc-2",
      rfc: "DEM010101BBB",
      alias: "Demo Sucursal Norte",
      fiel: "demo-fiel-b",
      downloads_enabled: true,
      created_at: now,
      last_update: now,
    },
  ];
}

export function getDemoNombreEmpresa(rfc: string): string {
  const map: Record<string, string> = {
    DEM010101AAA: "Demo Matriz SA de CV",
    DEM010101BBB: "Demo Sucursal Norte SA de CV",
  };
  return map[rfc] ?? `Empresa Demo ${rfc}`;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(rfc: string, dateFrom: Date, dateTo: Date): () => number {
  return mulberry32(hashString(`${rfc}|${dateFrom.toISOString()}|${dateTo.toISOString()}`));
}

function pick<T>(rand: () => number, values: T[]): T {
  return values[Math.floor(rand() * values.length)] as T;
}

function money(rand: () => number, min: number, max: number): number {
  return Number((min + rand() * (max - min)).toFixed(2));
}

function randomDate(rand: () => number, from: Date, to: Date): Date {
  const start = from.getTime();
  const end = Math.max(start + 86400000, to.getTime() - 1000);
  const value = start + Math.floor(rand() * (end - start));
  return new Date(value);
}

function randomRecentDemoDate(rand: () => number): Date {
  const now = new Date();
  const dayOffset = rand() > 0.5 ? 1 : 2;
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset)
  );
  // Keep realistic dispersion during the day.
  base.setUTCHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return base;
}

function fakeRfc(counter: number): string {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const p1 = letters[counter % letters.length];
  const p2 = letters[(counter + 3) % letters.length];
  const p3 = letters[(counter + 6) % letters.length];
  return `${p1}${p2}${p3}010101${letters[(counter + 1) % letters.length]}${letters[(counter + 2) % letters.length]}${letters[(counter + 4) % letters.length]}`;
}

function uuidLike(prefix: string, idx: number): string {
  const b = (idx + 1).toString(16).padStart(8, "0");
  return `${prefix}${b}-a1b2-4c3d-8e9f-${(idx + 1111).toString().padStart(12, "0")}`;
}

export function buildDemoDashboardData(rfc: string, dateFrom: Date, dateTo: Date) {
  const rand = rngFor(`dashboard:${rfc}`, dateFrom, dateTo);
  const ingresosTotal = money(rand, 800000, 2600000);
  const egresosTotal = money(rand, 250000, ingresosTotal * 0.72);
  const ivaTotal = Number((ingresosTotal * 0.16 * 0.88).toFixed(2));
  const isrRetenido = Number((ingresosTotal * 0.03).toFixed(2));
  const ivaRetenido = Number((egresosTotal * 0.02).toFixed(2));

  const topClientes = Array.from({ length: 5 }).map((_, i) => ({
    nombre: DEMO_RAZONES[i % DEMO_RAZONES.length],
    monto: money(rand, 90000, 520000),
  }));

  const topProveedores = Array.from({ length: 5 }).map((_, i) => ({
    nombre: DEMO_RAZONES[(i + 2) % DEMO_RAZONES.length],
    monto: money(rand, 50000, 320000),
  }));

  const topConceptosIngresos = Array.from({ length: 5 }).map((_, i) => ({
    concepto: DEMO_PRODUCTOS[i],
    monto: money(rand, 60000, 450000),
  }));

  const topConceptosEgresos = Array.from({ length: 5 }).map((_, i) => ({
    concepto: DEMO_PRODUCTOS[(i + 3) % DEMO_PRODUCTOS.length],
    monto: money(rand, 15000, 170000),
  }));

  return {
    ingresos: {
      total: ingresosTotal,
      count: Math.floor(40 + rand() * 90),
      vigentes: Math.floor(35 + rand() * 80),
      cancelados: Math.floor(1 + rand() * 6),
      ivaTotal,
      ivaRetenido,
      isrRetenido,
      isrEstimado: Number((Math.max(ingresosTotal - egresosTotal, 0) * 0.3).toFixed(2)),
      regimenFiscal: "601",
      regimenLabel: "General de Ley Personas Morales",
    },
    egresos: {
      total: egresosTotal,
      count: Math.floor(20 + rand() * 70),
    },
    topClientes,
    topProveedores,
    topConceptosIngresos,
    topConceptosEgresos,
    nominaRetenciones: {
      count: Math.floor(2 + rand() * 8),
      isr: Number((ingresosTotal * 0.018).toFixed(2)),
      imss: Number((ingresosTotal * 0.011).toFixed(2)),
    },
    isrRegimenes: [
      { code: "601", name: "General de Ley Personas Morales", rateHint: "30%" },
      { code: "612", name: "Personas Fisicas con Actividades Empresariales y Profesionales", rateHint: "30%" },
      { code: "625", name: "RESICO Personas Fisicas", rateHint: "1% a 2.5%" },
    ],
  };
}

export function buildDemoFacturasData(rfc: string, dateFrom: Date, dateTo: Date): FacturasData {
  const rand = rngFor(`facturas:${rfc}`, dateFrom, dateTo);

  const ingresos: IngresoCFDI[] = Array.from({ length: 10 }).map((_, i) => {
    const subtotal = money(rand, 8000, 120000);
    const iva16 = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + iva16).toFixed(2));
    return {
      UUID: uuidLike("f", i),
      Serie: "A",
      Folio: String(1000 + i),
      Fecha: randomRecentDemoDate(rand),
      Status: "Vigente",
      Version: "4.0",
      RFC_Receptor: fakeRfc(i),
      RazonSocialReceptor: pick(rand, DEMO_RAZONES),
      UsoCFDI: pick(rand, DEMO_USO_CFDI),
      MetodoPago: rand() > 0.5 ? "PUE" : "PPD",
      TipoPago: pick(rand, DEMO_FORMAS_PAGO),
      Moneda: "MXN",
      tipoCambio: 1,
      Subtotal: subtotal,
      Descuento: 0,
      BaseIVA16: subtotal,
      BaseIVA8: 0,
      BaseIVA0: 0,
      BaseIVAExento: 0,
      TotalTrasladadoIVADieciseis: iva16,
      TotalTrasladadoIVAOcho: 0,
      TotalTrasladadoIVACero: 0,
      TotalTrasladadoIVAExento: 0,
      TotalTrasladadoIEPS: 0,
      TotalTrasladado: iva16,
      TotalRetenidoISR: 0,
      TotalRetenidoIVA: 0,
      TotalRetenidoIEPS: 0,
      TotalRetenidos: 0,
      Total: total,
      Total_MXN: total,
      RegimenFiscal: "601",
      LugarExpedicion: "64000",
      Movimiento: "INGRESO",
    };
  });

  const egresos: EgresoCFDI[] = Array.from({ length: 10 }).map((_, i) => ({
    RFC_Emisor: fakeRfc(i + 20),
    RazonSocialEmisor: pick(rand, DEMO_RAZONES),
    NumFacturas: Math.floor(1 + rand() * 5),
    Vigentes: Math.floor(1 + rand() * 4),
    Canceladas: Math.floor(rand() * 2),
    Total_MXN: money(rand, 12000, 240000),
    IVA_MXN: money(rand, 1200, 28000),
    ISR_Retenido_MXN: money(rand, 0, 6000),
    IVA_Retenido_MXN: money(rand, 0, 4000),
    IEPS_MXN: money(rand, 0, 2000),
  }));

  const nomina: NominaCFDI[] = Array.from({ length: 6 }).map((_, i) => {
    const subtotal = money(rand, 18000, 46000);
    const total = subtotal;
    return {
      UUID: uuidLike("n", i),
      TipoNomina: i % 2 === 0 ? "Nomina Egreso" : "Nomina Ingreso",
      Fecha: randomRecentDemoDate(rand),
      Status: "Vigente",
      RFC_Emisor: rfc,
      RazonSocialEmisor: getDemoNombreEmpresa(rfc),
      RFC_Receptor: fakeRfc(i + 50),
      RazonSocialReceptor: pick(rand, DEMO_RAZONES),
      Moneda: "MXN",
      tipoCambio: 1,
      Subtotal: subtotal,
      Descuento: 0,
      TotalRetenidoISR: money(rand, 600, 1600),
      TotalRetenidoIVA: 0,
      Total: total,
      Total_MXN: total,
      LugarExpedicion: "64000",
    };
  });

  const retenciones: RetencionCFDI[] = Array.from({ length: 6 }).map((_, i) => {
    const total = money(rand, 5000, 24000);
    const isr = money(rand, 200, 1800);
    const iva = money(rand, 100, 900);
    return {
      UUID: uuidLike("r", i),
      Direccion: i % 2 === 0 ? "Emitida" : "Recibida",
      TipoComprobante: "I",
      Fecha: randomRecentDemoDate(rand),
      Status: "Vigente",
      RFC_Emisor: i % 2 === 0 ? rfc : fakeRfc(i + 70),
      RazonSocialEmisor: pick(rand, DEMO_RAZONES),
      RFC_Receptor: i % 2 === 0 ? fakeRfc(i + 80) : rfc,
      RazonSocialReceptor: pick(rand, DEMO_RAZONES),
      Moneda: "MXN",
      tipoCambio: 1,
      Total: total,
      Total_MXN: total,
      TotalRetenidoISR: isr,
      TotalRetenidoIVA: iva,
      TotalRetenidoIEPS: 0,
      TotalRetenidos: Number((isr + iva).toFixed(2)),
      ISR_MXN: isr,
      IVA_Ret_MXN: iva,
    };
  });

  return { ingresos, egresos, nomina, retenciones };
}

export function buildDemoRawCFDIForExport(rfc: string, dateFrom: Date, dateTo: Date): RawCFDIExport[] {
  const source = buildDemoFacturasData(rfc, dateFrom, dateTo);
  const rand = rngFor(`raw-export:${rfc}`, dateFrom, dateTo);

  const ingresosRows: RawCFDIExport[] = source.ingresos.map((row) => ({
    UUID: row.UUID,
    Fecha: row.Fecha,
    RFC_Emisor: rfc,
    RegimenFiscal: "601",
    RFC_Receptor: row.RFC_Receptor,
    RegimenFiscalReceptor: "612",
    Subtotal: row.Subtotal,
    IVA8: 0,
    IVA16: row.TotalTrasladadoIVADieciseis,
    TotalTrasladado: row.TotalTrasladado,
    RetISR: 0,
    RetIVA: 0,
    Descuento: 0,
    Total: row.Total,
    Moneda: "MXN",
    tipoCambio: 1,
    Movimiento: row.Movimiento,
    TipoComprobante: "I",
    TipoPago: row.TipoPago,
    MetodoPago: row.MetodoPago,
    UsoCFDI: row.UsoCFDI,
    NominaDeducciones: null,
  }));

  const egresosRows: RawCFDIExport[] = source.egresos.map((row, i) => ({
    UUID: uuidLike("g", i),
    Fecha: randomRecentDemoDate(rand),
    RFC_Emisor: row.RFC_Emisor,
    RegimenFiscal: "601",
    RFC_Receptor: rfc,
    RegimenFiscalReceptor: "601",
    Subtotal: Number(Math.max(row.Total_MXN - row.IVA_MXN, 0).toFixed(2)),
    IVA8: 0,
    IVA16: row.IVA_MXN,
    TotalTrasladado: row.IVA_MXN,
    RetISR: row.ISR_Retenido_MXN,
    RetIVA: row.IVA_Retenido_MXN,
    Descuento: 0,
    Total: row.Total_MXN,
    Moneda: "MXN",
    tipoCambio: 1,
    Movimiento: "Egreso",
    TipoComprobante: "I",
    TipoPago: "03",
    MetodoPago: "PUE",
    UsoCFDI: "G03",
    NominaDeducciones: null,
  }));

  const nominaRows: RawCFDIExport[] = source.nomina.map((row) => ({
    UUID: row.UUID,
    Fecha: row.Fecha,
    RFC_Emisor: row.RFC_Emisor,
    RegimenFiscal: "601",
    RFC_Receptor: row.RFC_Receptor,
    RegimenFiscalReceptor: "605",
    Subtotal: row.Subtotal,
    IVA8: 0,
    IVA16: 0,
    TotalTrasladado: 0,
    RetISR: row.TotalRetenidoISR,
    RetIVA: row.TotalRetenidoIVA,
    Descuento: row.Descuento,
    Total: row.Total,
    Moneda: row.Moneda,
    tipoCambio: row.tipoCambio,
    Movimiento: row.TipoNomina.toUpperCase().includes("INGRESO") ? "Ingreso" : "Egreso",
    TipoComprobante: "N",
    TipoPago: "99",
    MetodoPago: "PUE",
    UsoCFDI: "CN01",
    NominaDeducciones: null,
  }));

  const retencionesRows: RawCFDIExport[] = source.retenciones.map((row) => ({
    UUID: row.UUID,
    Fecha: row.Fecha,
    RFC_Emisor: row.RFC_Emisor,
    RegimenFiscal: "601",
    RFC_Receptor: row.RFC_Receptor,
    RegimenFiscalReceptor: "601",
    Subtotal: row.Total,
    IVA8: 0,
    IVA16: 0,
    TotalTrasladado: 0,
    RetISR: row.TotalRetenidoISR,
    RetIVA: row.TotalRetenidoIVA,
    Descuento: 0,
    Total: row.Total,
    Moneda: row.Moneda,
    tipoCambio: row.tipoCambio,
    Movimiento: row.Direccion === "Emitida" ? "Ingreso" : "Egreso",
    TipoComprobante: row.TipoComprobante,
    TipoPago: "99",
    MetodoPago: "PUE",
    UsoCFDI: "G03",
    NominaDeducciones: null,
  }));

  return [...ingresosRows, ...egresosRows, ...nominaRows, ...retencionesRows];
}

export function buildDemoConceptos(rfc: string, dateFrom: Date, dateTo: Date): { ingresos: ConceptoRow[]; egresos: ConceptoRow[] } {
  const rand = rngFor(`conceptos:${rfc}`, dateFrom, dateTo);
  const build = (offset: number): ConceptoRow[] =>
    Array.from({ length: 10 }).map((_, i) => {
      const importe = money(rand, 10000, 260000);
      const iva16 = Number((importe * 0.16).toFixed(2));
      return {
        descripcion: DEMO_PRODUCTOS[(i + offset) % DEMO_PRODUCTOS.length],
        claveProdServ: String(80100000 + i + offset),
        cantidad: Number((1 + rand() * 9).toFixed(2)),
        importe,
        iva8: 0,
        iva16,
        numFacturas: Math.floor(1 + rand() * 7),
      };
    });

  return { ingresos: build(0), egresos: build(3) };
}

export function buildDemoPagos(rfc: string, dateFrom: Date, dateTo: Date): PagoRow[] {
  const rand = rngFor(`pagos:${rfc}`, dateFrom, dateTo);
  return Array.from({ length: 10 }).map((_, i) => {
    const pago = money(rand, 3000, 70000);
    const base = Number((pago / 1.16).toFixed(2));
    const impuesto = Number((pago - base).toFixed(2));
    return {
      uuid_pago: uuidLike("p", i),
      fechaEmision: randomDate(rand, dateFrom, dateTo),
      fechaPago: randomDate(rand, dateFrom, dateTo),
      forma_pago: pick(rand, DEMO_FORMAS_PAGO),
      moneda_pago: "MXN",
      tipoCambio: 1,
      total_pago: pago,
      uuid_relacionado: uuidLike("d", i),
      moneda_docto: "MXN",
      numParcialidad: Math.floor(1 + rand() * 3),
      saldo_anterior: Number((pago + money(rand, 300, 3000)).toFixed(2)),
      saldo_pagado: pago,
      saldo_insoluto: money(rand, 0, 800),
      base,
      impuesto,
      tipo_factor: "Tasa",
      tasa_o_cuota: 0.16,
      importe: impuesto,
      objetoImpuesto: "02",
      RFC_emisor: i % 2 === 0 ? rfc : fakeRfc(i + 30),
      RFC_receptor: i % 2 === 0 ? fakeRfc(i + 31) : rfc,
    };
  });
}

export function buildDemoNotasCredito(rfc: string, dateFrom: Date, dateTo: Date): NotaCreditoRow[] {
  const rand = rngFor(`notas:${rfc}`, dateFrom, dateTo);
  return Array.from({ length: 10 }).map((_, i) => {
    const subtotal = money(rand, 2500, 50000);
    const iva16 = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + iva16).toFixed(2));
    return {
      uuid: uuidLike("c", i),
      fecha: randomDate(rand, dateFrom, dateTo),
      RFC_emisor: i % 2 === 0 ? rfc : fakeRfc(i + 40),
      RegimenFiscal: "601",
      RFC_receptor: i % 2 === 0 ? fakeRfc(i + 41) : rfc,
      RegimenFiscalReceptor: "612",
      subtotal,
      iva8: 0,
      iva16,
      totaltrasladados: iva16,
      retISR: 0,
      retIVA: 0,
      totalretenidos: 0,
      descuento: 0,
      total,
      TipoPago: pick(rand, DEMO_FORMAS_PAGO),
      Moneda: "MXN",
      tipoCambio: 1,
      TipoComprobante: "E",
      MetodoPago: i % 2 === 0 ? "PUE" : "PPD",
    };
  });
}

export function buildDemoFlujo(rfc: string, dateFrom: Date, dateTo: Date): flujoRow[] {
  const rand = rngFor(`flujo:${rfc}`, dateFrom, dateTo);
  return Array.from({ length: 12 }).map((_, i) => {
    const subtotal = money(rand, 4500, 90000);
    const iva = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + iva).toFixed(2));
    return {
      uuid: uuidLike("u", i),
      fuente: i % 2 === 0 ? "Complemento P" : "Factura PUE",
      fechaEmision: randomDate(rand, dateFrom, dateTo),
      fechaPago: i % 2 === 0 ? randomDate(rand, dateFrom, dateTo) : null,
      uuidDocumentoRelacionado: uuidLike("v", i),
      RFC_emisor: i % 2 === 0 ? rfc : fakeRfc(i + 60),
      RazonSocialEmisor: pick(rand, DEMO_RAZONES),
      RFC_receptor: i % 2 === 0 ? fakeRfc(i + 61) : rfc,
      RazonSocialReceptor: pick(rand, DEMO_RAZONES),
      formaPago: pick(rand, DEMO_FORMAS_PAGO),
      moneda: "MXN",
      tipoCambio: 1,
      subtotal,
      iva,
      retISR: 0,
      retIVA: 0,
      total,
      movimiento: i % 2 === 0 ? "INGRESO" : "EGRESO",
    };
  });
}
