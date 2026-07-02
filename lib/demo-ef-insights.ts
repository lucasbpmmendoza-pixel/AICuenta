import type { BenchmarkData } from "@/app/components/EstadosFinancierosBenchmarkModal";
import type { AuditData, AuditCfdi, AuditItem } from "@/app/components/EstadosFinancierosAuditModal";
import { getDemoNombreEmpresa } from "@/lib/demo-data";

// ─── Datos falsos para los modales "Comparar" y "Auditar" en modo demo ──────────
//
// El modo demo no llama a la IA (las rutas /benchmark y /audit-conceptos la
// bloquean). Estos builders devuelven datos creíbles y FIJOS por RFC para que las
// dos demos —"Demo Matriz" (perfil software) y "Demo Sucursal Norte" (perfil
// distribución mayorista)— se vean distintas y completas.

const RFC_MATRIZ = "DEM010101AAA";

// Razones sociales de contraparte (clientes/proveedores). Sin acentos en el nombre
// propio, igual que DEMO_RAZONES en demo-data.ts; así combinan con el resto del demo.
const CLIENTES_TECH = [
  "Innovacion Digital del Pacifico SA de CV",
  "Grupo Comercial Aranda SA de CV",
  "Corporativo Medica del Valle SC",
  "Distribuidora Vanguardia SA de CV",
];
const PROVEEDORES_TECH = [
  "Servicios en la Nube MX SA de CV",
  "Despacho Juridico Olvera y Asociados SC",
  "Talento TI Outsourcing SA de CV",
  "Suministros Tecnologicos del Norte SA de CV",
];
const CLIENTES_NORTE = [
  "Abarrotes La Surtidora SA de CV",
  "Tiendas del Valle SA de CV",
  "Minisuper Don Beto SA de CV",
  "Comercializadora El Faro SA de CV",
];
const PROVEEDORES_NORTE = [
  "Aceites y Conservas del Centro SA de CV",
  "Empaques y Cartones del Norte SA de CV",
  "Fletes Rapidos del Bajio SA de CV",
  "Energia y Servicios Industriales SA de CV",
];

function periodoLabel(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** UUID determinístico con pinta de folio fiscal real (no aleatorio entre renders). */
function demoUuid(tag: string, n: number): string {
  const seed = tag.charCodeAt(0) * 131 + n * 977;
  const a = (seed >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  const b = ((n * 4099 + 7) >>> 0).toString(16).padStart(4, "0").slice(0, 4);
  const tail = (n * 100000 + 12345).toString().padStart(12, "0").slice(0, 12);
  return `${a}-${b}-4d3c-8e9f-${tail}`;
}

function cfdi(
  tag: string,
  n: number,
  year: number,
  month: number,
  day: number,
  importe: number,
  contraparte: string,
): AuditCfdi {
  return {
    uuid: demoUuid(tag, n),
    serie: "A",
    folio: String(1000 + n),
    fecha: isoDate(year, month, day),
    importe,
    contraparte,
  };
}

/** Reparte un importe de grupo en `count` comprobantes (suma exacta = total). */
function splitCfdis(
  tag: string,
  count: number,
  year: number,
  month: number,
  total: number,
  contrapartes: string[],
): AuditCfdi[] {
  const base = total / count;
  const out: AuditCfdi[] = [];
  let acc = 0;
  for (let i = 0; i < count; i += 1) {
    const factor = 1 + (((i % 3) - 1) * 0.18); // patrón 0.82 / 1.00 / 1.18
    let importe = Number((base * factor).toFixed(2));
    if (i === count - 1) importe = Number((total - acc).toFixed(2));
    acc = Number((acc + importe).toFixed(2));
    const day = Math.min(28, 2 + i * 3 + (tag.charCodeAt(0) % 5));
    out.push(cfdi(tag, i + 1, year, month, day, importe, contrapartes[i % contrapartes.length]));
  }
  return out;
}

function resumenFrom(items: AuditItem[]): AuditData["resumen"] {
  const r = { ok: 0, sospechoso: 0, incorrecto: 0, sin_catalogo: 0 };
  for (const it of items) r[it.veredicto] += 1;
  return r;
}

// ─── Comparar (benchmark vs mercado) ────────────────────────────────────────────

export function buildDemoBenchmark(rfc: string, year: number, month: number): BenchmarkData {
  const periodo = periodoLabel(year, month);
  const razonSocial = getDemoNombreEmpresa(rfc);

  if (rfc !== RFC_MATRIZ) {
    // Demo Sucursal Norte — distribución / comercio al por mayor.
    return {
      ok: true,
      industria: "Comercio al por mayor y distribución",
      resumen:
        "Demo Sucursal Norte muestra el perfil típico de un distribuidor mayorista: el costo de mercancía domina el gasto. El margen está presionado porque inventario y logística quedan por arriba del estándar del sector.",
      alertas: [
        "El costo de mercancía (60%) supera el estándar de la industria (55%): el margen bruto está bajo presión.",
        "La inversión en publicidad (3%) es marginal frente al 8% típico del sector.",
      ],
      recomendaciones: [
        "Renegocia con proveedores por volumen para reducir el costo de inventario.",
        "Compara tarifas entre paqueterías para bajar el costo logístico.",
        "Destina un porcentaje pequeño a promoción para aumentar la rotación de inventario.",
      ],
      categorias: [
        {
          nombre: "Costo de mercancía / Inventario",
          estandar_pct: 55,
          real_pct: 60,
          real_monto: 534000,
          comentario: "Por arriba del estándar; el costo de inventario presiona el margen.",
        },
        {
          nombre: "Nómina",
          estandar_pct: 15,
          real_pct: 16,
          real_monto: 142000,
          comentario: "En línea con el estándar del comercio.",
        },
        {
          nombre: "Logística y fletes",
          estandar_pct: 12,
          real_pct: 13,
          real_monto: 116000,
          comentario: "Ligeramente arriba; revisa tarifas de paquetería.",
        },
        {
          nombre: "Renta y servicios (bodega/local)",
          estandar_pct: 10,
          real_pct: 8,
          real_monto: 71000,
          comentario: "Por debajo del estándar.",
        },
        {
          nombre: "Publicidad / Marketing",
          estandar_pct: 8,
          real_pct: 3,
          real_monto: 27000,
          comentario: "Muy por debajo; poca inversión en promoción.",
        },
      ],
      meta: {
        rfc,
        periodo,
        razonSocial,
        totales: { ingresosTotal: 1180000, egresosTotal: 890000, nominaTotal: 240000 },
      },
    };
  }

  // Demo Matriz — desarrollo de software y consultoría TI.
  return {
    ok: true,
    industria: "Desarrollo de software y consultoría en TI",
    resumen:
      "Demo Matriz opera con una estructura de gasto intensiva en talento, propia de empresas de software en crecimiento. Nómina y tecnología están por arriba del estándar, mientras que marketing y renta quedan por debajo.",
    alertas: [
      "El gasto en nómina (52%) supera en 7 pp el estándar de la industria (45%); valida que no haya duplicidad de roles.",
      "Marketing al 8% está muy por debajo del 15% típico; el bajo gasto en adquisición puede frenar el crecimiento.",
    ],
    recomendaciones: [
      "Consolida licencias de software: se detectan varias suscripciones SaaS con función similar.",
      "Reasigna parte del presupuesto hacia marketing digital para acercarte al estándar del sector.",
      "Evalúa esquemas de nómina (asimilados vs. honorarios) para optimizar la carga.",
    ],
    categorias: [
      {
        nombre: "Nómina",
        estandar_pct: 45,
        real_pct: 52,
        real_monto: 720000,
        comentario: "Por arriba del estándar: la nómina concentra más de la mitad del gasto.",
      },
      {
        nombre: "Infraestructura / Tecnología",
        estandar_pct: 18,
        real_pct: 21,
        real_monto: 290000,
        comentario: "Ligeramente arriba; revisa licencias SaaS duplicadas.",
      },
      {
        nombre: "Servicios profesionales",
        estandar_pct: 12,
        real_pct: 14,
        real_monto: 193000,
        comentario: "En línea con el sector.",
      },
      {
        nombre: "Publicidad / Marketing",
        estandar_pct: 15,
        real_pct: 8,
        real_monto: 110000,
        comentario: "Por debajo del estándar; hay espacio para invertir en adquisición.",
      },
      {
        nombre: "Renta y oficinas",
        estandar_pct: 10,
        real_pct: 5,
        real_monto: 69000,
        comentario: "Por debajo, consistente con un esquema híbrido/remoto.",
      },
    ],
    meta: {
      rfc,
      periodo,
      razonSocial,
      totales: { ingresosTotal: 2450000, egresosTotal: 1180000, nominaTotal: 720000 },
    },
  };
}

// ─── Auditar (descripción emisor vs catálogo SAT) ───────────────────────────────

export function buildDemoAudit(rfc: string, year: number, month: number): AuditData {
  const periodo = periodoLabel(year, month);

  if (rfc !== RFC_MATRIZ) {
    // Demo Sucursal Norte — comercio al por mayor / distribución.
    const items: AuditItem[] = [
      {
        tipo: "ingreso",
        clave: "50171550",
        satDesc: "Aceites comestibles",
        emisorDesc: "Venta de aceite vegetal caja con 12 piezas (mayoreo)",
        numConceptos: 12,
        importe: 186000.0,
        veredicto: "ok",
        razon: "La descripción del emisor coincide con la clave del catálogo SAT.",
        cfdis: splitCfdis("a", 4, year, month, 186000.0, CLIENTES_NORTE),
      },
      {
        tipo: "ingreso",
        clave: "50192100",
        satDesc: "Productos alimenticios enlatados",
        emisorDesc: "Venta de conservas surtidas a granel",
        numConceptos: 9,
        importe: 142000.0,
        veredicto: "ok",
        razon: "Coincide con la clave del catálogo SAT.",
        cfdis: splitCfdis("b", 3, year, month, 142000.0, CLIENTES_NORTE),
      },
      {
        tipo: "egreso",
        clave: "24111500",
        satDesc: "Cajas de cartón corrugado",
        emisorDesc: "Caja de cartón corrugado para empaque",
        numConceptos: 9,
        importe: 18250.0,
        veredicto: "ok",
        razon: "La descripción coincide con la clave SAT.",
        cfdis: splitCfdis("c", 2, year, month, 18250.0, PROVEEDORES_NORTE),
      },
      {
        tipo: "egreso",
        clave: "14111500",
        satDesc: "Papel para impresión o escritura",
        emisorDesc: "Resma de papel bond carta 75g",
        numConceptos: 4,
        importe: 6420.0,
        veredicto: "ok",
        razon: "Coincide con la clave del catálogo SAT.",
        cfdis: [cfdi("d", 1, year, month, 6, 6420.0, PROVEEDORES_NORTE[1])],
      },
      {
        tipo: "egreso",
        clave: "83101800",
        satDesc: "Servicios de electricidad",
        emisorDesc: "Consumo de energía eléctrica de la bodega (CFE)",
        numConceptos: 1,
        importe: 22800.0,
        veredicto: "ok",
        razon: "La descripción coincide con la clave SAT.",
        cfdis: [cfdi("e", 1, year, month, 13, 22800.0, PROVEEDORES_NORTE[3])],
      },
      {
        tipo: "egreso",
        clave: "80131500",
        satDesc: "Alquiler de bienes inmuebles",
        emisorDesc: "Renta mensual de bodega y local comercial",
        numConceptos: 1,
        importe: 38000.0,
        veredicto: "ok",
        razon: "Coincide con la clave del catálogo SAT.",
        cfdis: [cfdi("g", 1, year, month, 3, 38000.0, "Inmobiliaria Patrimonial del Norte SA de CV")],
      },
      {
        tipo: "ingreso",
        clave: "43232408",
        satDesc: "Software de gestión de inventario",
        emisorDesc: "Venta de mercancía de mostrador surtida",
        numConceptos: 3,
        importe: 52600.0,
        veredicto: "sospechoso",
        razon: "La clave es de software pero la descripción es venta de mercancía física; corrige la clave de tus productos para evitar observaciones.",
        cfdis: splitCfdis("h", 2, year, month, 52600.0, CLIENTES_NORTE),
      },
      {
        tipo: "egreso",
        clave: "78101800",
        satDesc: "Transporte de carga por carretera",
        emisorDesc: "Flete y maniobras de carga (incluye propina al personal)",
        numConceptos: 6,
        importe: 41300.0,
        veredicto: "sospechoso",
        razon: "El concepto incluye 'propina'; revisa la deducibilidad de ese componente.",
        cfdis: splitCfdis("i", 3, year, month, 41300.0, PROVEEDORES_NORTE),
      },
      {
        tipo: "egreso",
        clave: "80141600",
        satDesc: "Actividades de ventas y promoción de negocios",
        emisorDesc: "Comisiones a vendedores externos del mes",
        numConceptos: 28,
        importe: 64000.0,
        veredicto: "sospechoso",
        razon: "Grupo grande de comisiones; valida las retenciones de honorarios o el esquema de asimilados a salarios.",
        cfdis: splitCfdis("j", 5, year, month, 64000.0, PROVEEDORES_NORTE),
      },
      {
        tipo: "egreso",
        clave: "50201700",
        satDesc: "Café",
        emisorDesc: "Renta mensual de montacargas para la bodega",
        numConceptos: 1,
        importe: 14500.0,
        veredicto: "incorrecto",
        razon: "La clave corresponde a 'Café' pero la descripción es renta de equipo; clave mal asignada por el emisor.",
        cfdis: [cfdi("k", 1, year, month, 14, 14500.0, PROVEEDORES_NORTE[3])],
      },
      {
        tipo: "egreso",
        clave: "50301500",
        satDesc: "Frutas frescas",
        emisorDesc: "Mantenimiento de la cámara de refrigeración",
        numConceptos: 1,
        importe: 16700.0,
        veredicto: "incorrecto",
        razon: "La clave es 'Frutas frescas' pero la descripción es un servicio de mantenimiento; clave incorrecta.",
        cfdis: [cfdi("l", 1, year, month, 17, 16700.0, "Servicios Industriales del Bajio SA de CV")],
      },
      {
        tipo: "egreso",
        clave: "00000000",
        satDesc: "",
        emisorDesc: "Ajuste de inventario por mermas",
        numConceptos: 2,
        importe: 3850.0,
        veredicto: "sin_catalogo",
        razon: "La clave no existe en el catálogo de producto/servicio del SAT vigente.",
        cfdis: [cfdi("m", 1, year, month, 21, 3850.0, "Operadora Muestra del Bajio SA de CV")],
      },
    ];
    return {
      ok: true,
      rfc,
      periodo,
      totalRevisados: items.length,
      resumen: resumenFrom(items),
      items,
      giro: ["Comercio al por mayor de abarrotes y materias primas", "Distribución y logística"],
    };
  }

  // Demo Matriz — desarrollo de software y consultoría TI.
  const items: AuditItem[] = [
    {
      tipo: "ingreso",
      clave: "81111501",
      satDesc: "Desarrollo de aplicaciones",
      emisorDesc: "Desarrollo de módulo de facturación CFDI 4.0 a la medida",
      numConceptos: 8,
      importe: 248000.0,
      veredicto: "ok",
      razon: "La descripción del emisor coincide con la clave del catálogo SAT.",
      cfdis: splitCfdis("a", 3, year, month, 248000.0, CLIENTES_TECH),
    },
    {
      tipo: "ingreso",
      clave: "81112200",
      satDesc: "Mantenimiento o soporte de software",
      emisorDesc: "Soporte y mantenimiento mensual (mesa de ayuda)",
      numConceptos: 4,
      importe: 96000.0,
      veredicto: "ok",
      razon: "La descripción coincide con la clave SAT.",
      cfdis: splitCfdis("b", 4, year, month, 96000.0, CLIENTES_TECH),
    },
    {
      tipo: "egreso",
      clave: "81161700",
      satDesc: "Servicios de cómputo en la nube",
      emisorDesc: "Hospedaje en la nube (AWS) y red de distribución de contenido",
      numConceptos: 6,
      importe: 84500.0,
      veredicto: "ok",
      razon: "Coincide con la clave del catálogo SAT.",
      cfdis: splitCfdis("c", 3, year, month, 84500.0, PROVEEDORES_TECH),
    },
    {
      tipo: "egreso",
      clave: "80121600",
      satDesc: "Servicios legales",
      emisorDesc: "Asesoría legal mercantil y revisión de contratos",
      numConceptos: 2,
      importe: 31000.0,
      veredicto: "ok",
      razon: "La descripción coincide con la clave SAT.",
      cfdis: splitCfdis("d", 2, year, month, 31000.0, PROVEEDORES_TECH),
    },
    {
      tipo: "egreso",
      clave: "84111600",
      satDesc: "Servicios de contabilidad",
      emisorDesc: "Honorarios contables del mes",
      numConceptos: 1,
      importe: 18000.0,
      veredicto: "ok",
      razon: "Coincide con la clave SAT.",
      cfdis: [cfdi("e", 1, year, month, 9, 18000.0, "Despacho Contable Reyes y Asociados SC")],
    },
    {
      tipo: "egreso",
      clave: "82101500",
      satDesc: "Publicidad",
      emisorDesc: "Campaña de Google Ads y redes sociales",
      numConceptos: 3,
      importe: 45000.0,
      veredicto: "ok",
      razon: "La descripción coincide con la clave SAT.",
      cfdis: splitCfdis("f", 3, year, month, 45000.0, PROVEEDORES_TECH),
    },
    {
      tipo: "egreso",
      clave: "43211503",
      satDesc: "Computadoras portátiles",
      emisorDesc: "Equipo de cómputo para el área de desarrollo (laptops)",
      numConceptos: 4,
      importe: 128000.0,
      veredicto: "ok",
      razon: "Coincide con la clave del catálogo SAT.",
      cfdis: splitCfdis("g", 4, year, month, 128000.0, PROVEEDORES_TECH),
    },
    {
      tipo: "ingreso",
      clave: "81111811",
      satDesc: "Servicios de mantenimiento de aplicaciones de TI",
      emisorDesc: "Licencia SaaS anual — plan enterprise",
      numConceptos: 5,
      importe: 320000.0,
      veredicto: "sospechoso",
      razon: "La descripción sugiere la venta de una licencia/suscripción; valida que la clave de servicio sea la correcta para no afectar la deducción del cliente.",
      cfdis: splitCfdis("h", 2, year, month, 320000.0, CLIENTES_TECH),
    },
    {
      tipo: "egreso",
      clave: "80101500",
      satDesc: "Servicios de consultoría de negocios y administración corporativa",
      emisorDesc: "Consultoría estratégica y viáticos del consultor",
      numConceptos: 4,
      importe: 73500.0,
      veredicto: "sospechoso",
      razon: "El concepto mezcla la consultoría con viáticos; conviene desglosarlos en CFDI separados para sustentar la deducción.",
      cfdis: splitCfdis("i", 2, year, month, 73500.0, PROVEEDORES_TECH),
    },
    {
      tipo: "egreso",
      clave: "80111600",
      satDesc: "Servicios de personal temporal",
      emisorDesc: "Outsourcing de desarrollo (staff augmentation)",
      numConceptos: 32,
      importe: 410000.0,
      veredicto: "sospechoso",
      razon: "Grupo grande de prestación de personal; verifica el registro REPSE del proveedor y las retenciones aplicables.",
      cfdis: splitCfdis("j", 6, year, month, 410000.0, PROVEEDORES_TECH),
    },
    {
      tipo: "egreso",
      clave: "50202301",
      satDesc: "Refrescos y bebidas no alcohólicas",
      emisorDesc: "Servicio de cómputo en la nube (Microsoft Azure) mensual",
      numConceptos: 1,
      importe: 58900.0,
      veredicto: "incorrecto",
      razon: "La clave corresponde a 'Refrescos' pero la descripción es un servicio en la nube; clave mal asignada por el emisor.",
      cfdis: [cfdi("k", 1, year, month, 15, 58900.0, PROVEEDORES_TECH[0])],
    },
    {
      tipo: "egreso",
      clave: "90101800",
      satDesc: "Banquetes y servicios de catering",
      emisorDesc: "Suscripción mensual de software de diseño",
      numConceptos: 1,
      importe: 12400.0,
      veredicto: "incorrecto",
      razon: "La clave corresponde a 'Banquetes' pero la descripción es software; clave incorrecta.",
      cfdis: [cfdi("l", 1, year, month, 11, 12400.0, "Estudio Creativo Pixel SA de CV")],
    },
    {
      tipo: "egreso",
      clave: "99999999",
      satDesc: "",
      emisorDesc: "Cargos varios sin especificar",
      numConceptos: 2,
      importe: 9300.0,
      veredicto: "sin_catalogo",
      razon: "La clave no existe en el catálogo de producto/servicio del SAT vigente.",
      cfdis: [cfdi("m", 1, year, month, 18, 9300.0, PROVEEDORES_TECH[3])],
    },
  ];
  return {
    ok: true,
    rfc,
    periodo,
    totalRevisados: items.length,
    resumen: resumenFrom(items),
    items,
    giro: ["Desarrollo de software", "Consultoría en tecnologías de la información"],
  };
}
