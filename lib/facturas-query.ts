import sql from "mssql";
import { getDb, getDbLong } from "@/lib/db";

// ─── Cache en memoria para fetchEstadosFinancieros ────────────────────────────
// TTL 15 min: consulta muy pesada (~2 min) — se cachea por RFC+rango+limit
const _efCache = new Map<string, { data: EstadosFinancierosData; exp: number }>();
const EF_TTL_MS = 15 * 60 * 1000;

const TC = "ISNULL(NULLIF(tipoCambio,0),1)";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngresoCFDI {
  UUID: string;
  Serie: string;
  Folio: string;
  Fecha: Date;
  Status: string;
  Version: string;
  RFC_Receptor: string;
  RazonSocialReceptor: string;
  UsoCFDI: string;
  MetodoPago: string;
  TipoPago: string;
  Moneda: string;
  tipoCambio: number;
  Subtotal: number;
  Descuento: number;
  BaseIVA16: number;
  BaseIVA8: number;
  BaseIVA0: number;
  BaseIVAExento: number;
  TotalTrasladadoIVADieciseis: number;
  TotalTrasladadoIVAOcho: number;
  TotalTrasladadoIVACero: number;
  TotalTrasladadoIVAExento: number;
  TotalTrasladadoIEPS: number;
  TotalTrasladado: number;
  TotalRetenidoISR: number;
  TotalRetenidoIVA: number;
  TotalRetenidoIEPS: number;
  TotalRetenidos: number;
  Total: number;
  Total_MXN: number;
  RegimenFiscal: string;
  LugarExpedicion: string;
  Movimiento: string;
}

export interface EgresoCFDI {
  RFC_Emisor: string;
  RazonSocialEmisor: string;
  NumFacturas: number;
  Vigentes: number;
  Canceladas: number;
  Total_MXN: number;
  IVA_MXN: number;
  ISR_Retenido_MXN: number;
  IVA_Retenido_MXN: number;
  IEPS_MXN: number;
}

export interface NominaCFDI {
  UUID: string;
  TipoNomina: string;
  Fecha: Date;
  Status: string;
  RFC_Emisor: string;
  RazonSocialEmisor: string;
  RFC_Receptor: string;
  RazonSocialReceptor: string;
  Moneda: string;
  tipoCambio: number;
  Subtotal: number;
  Descuento: number;
  TotalRetenidoISR: number;
  TotalRetenidoIVA: number;
  Total: number;
  Total_MXN: number;
  LugarExpedicion: string;
}

export interface RetencionCFDI {
  UUID: string;
  Direccion: string;
  TipoComprobante: string;
  Fecha: Date;
  Status: string;
  RFC_Emisor: string;
  RazonSocialEmisor: string;
  RFC_Receptor: string;
  RazonSocialReceptor: string;
  Moneda: string;
  tipoCambio: number;
  Total: number;
  Total_MXN: number;
  TotalRetenidoISR: number;
  TotalRetenidoIVA: number;
  TotalRetenidoIEPS: number;
  TotalRetenidos: number;
  ISR_MXN: number;
  IVA_Ret_MXN: number;
}

export interface FacturasData {
  ingresos: IngresoCFDI[];
  egresos: EgresoCFDI[];
  nomina: NominaCFDI[];
  retenciones: RetencionCFDI[];
}

// ─── Main query ────────────────────────────────────────────────────────────────

export async function fetchFacturasData(
  rfc: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FacturasData> {
  const db = await getDb();

  const [ingresosRes, egresosRes, nominaRes, retencionesRes] = await Promise.all([
    // Q0: Ingresos emitidos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<IngresoCFDI>(`
        SELECT TOP 10
          UUID, ISNULL(Serie,'') AS Serie, ISNULL(Folio,'') AS Folio,
          Fecha, ISNULL(Status,'') AS Status, ISNULL(Version,'') AS Version,
          ISNULL(RFC_Receptor,'') AS RFC_Receptor,
          ISNULL(RazonSocialReceptor,'') AS RazonSocialReceptor,
          ISNULL(UsoCFDI,'') AS UsoCFDI,
          ISNULL(MetodoPago,'') AS MetodoPago,
          ISNULL(TipoPago,'') AS TipoPago,
          ISNULL(Moneda,'MXN') AS Moneda,
          ISNULL(tipoCambio,1) AS tipoCambio,
          ISNULL(Subtotal,0) AS Subtotal,
          ISNULL(Descuento,0) AS Descuento,
          ISNULL(BaseIVA16,0) AS BaseIVA16, ISNULL(BaseIVA8,0) AS BaseIVA8,
          ISNULL(BaseIVA0,0) AS BaseIVA0, ISNULL(BaseIVAExento,0) AS BaseIVAExento,
          ISNULL(TotalTrasladadoIVADieciseis,0) AS TotalTrasladadoIVADieciseis,
          ISNULL(TotalTrasladadoIVAOcho,0) AS TotalTrasladadoIVAOcho,
          ISNULL(TotalTrasladadoIVACero,0) AS TotalTrasladadoIVACero,
          ISNULL(TotalTrasladadoIVAExento,0) AS TotalTrasladadoIVAExento,
          ISNULL(TotalTrasladadoIEPS,0) AS TotalTrasladadoIEPS,
          ISNULL(TotalTrasladado,0) AS TotalTrasladado,
          ISNULL(TotalRetenidoISR,0) AS TotalRetenidoISR,
          ISNULL(TotalRetenidoIVA,0) AS TotalRetenidoIVA,
          ISNULL(TotalRetenidoIEPS,0) AS TotalRetenidoIEPS,
          ISNULL(TotalRetenidos,0) AS TotalRetenidos,
          ISNULL(Total,0) AS Total,
          ISNULL(Total,0) * ${TC} AS Total_MXN,
          ISNULL(RegimenFiscal,'') AS RegimenFiscal,
          ISNULL(LugarExpedicion,'') AS LugarExpedicion,
          ISNULL(Movimiento,'') AS Movimiento
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Emisor=@rfc AND TipoComprobante='I'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
        ORDER BY Fecha DESC
      `),

    // Q1: Egresos agrupados por RFC emisor
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<EgresoCFDI>(`
        SELECT TOP 10
          RFC_Emisor,
          ISNULL(NULLIF(RazonSocialEmisor,''), RFC_Emisor) AS RazonSocialEmisor,
          COUNT(*) AS NumFacturas,
          SUM(CASE WHEN Status='Vigente'  THEN 1 ELSE 0 END) AS Vigentes,
          SUM(CASE WHEN Status<>'Vigente' THEN 1 ELSE 0 END) AS Canceladas,
          ISNULL(SUM(ISNULL(Total,0)                * ${TC}),0) AS Total_MXN,
          ISNULL(SUM(ISNULL(TotalTrasladadoIVA,0)   * ${TC}),0) AS IVA_MXN,
          ISNULL(SUM(ISNULL(TotalRetenidoISR,0)     * ${TC}),0) AS ISR_Retenido_MXN,
          ISNULL(SUM(ISNULL(TotalRetenidoIVA,0)     * ${TC}),0) AS IVA_Retenido_MXN,
          ISNULL(SUM(ISNULL(TotalTrasladadoIEPS,0)  * ${TC}),0) AS IEPS_MXN
        FROM facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
        GROUP BY RFC_Emisor, RazonSocialEmisor
        ORDER BY Total_MXN DESC
      `),

    // Q2: Nómina — UNION ALL evita OR para mejor uso de índices
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<NominaCFDI>(`
        SELECT TOP 10 * FROM (
          SELECT
            UUID, Fecha, ISNULL(Status,'') AS Status,
            ISNULL(RFC_Emisor,'') AS RFC_Emisor,
            ISNULL(RazonSocialEmisor,'') AS RazonSocialEmisor,
            ISNULL(RFC_Receptor,'') AS RFC_Receptor,
            ISNULL(RazonSocialReceptor,'') AS RazonSocialReceptor,
            ISNULL(Moneda,'MXN') AS Moneda,
            ISNULL(tipoCambio,1) AS tipoCambio,
            ISNULL(Subtotal,0) AS Subtotal,
            ISNULL(Descuento,0) AS Descuento,
            ISNULL(TotalRetenidoISR,0) AS TotalRetenidoISR,
            ISNULL(TotalRetenidoIVA,0) AS TotalRetenidoIVA,
            ISNULL(Total,0) AS Total,
            ISNULL(Total,0) * ${TC} AS Total_MXN,
            ISNULL(LugarExpedicion,'') AS LugarExpedicion,
            'Nómina Egreso' AS TipoNomina
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc AND TipoComprobante='N'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          UNION ALL
          SELECT
            UUID, Fecha, ISNULL(Status,'') AS Status,
            ISNULL(RFC_Emisor,'') AS RFC_Emisor,
            ISNULL(RazonSocialEmisor,'') AS RazonSocialEmisor,
            ISNULL(RFC_Receptor,'') AS RFC_Receptor,
            ISNULL(RazonSocialReceptor,'') AS RazonSocialReceptor,
            ISNULL(Moneda,'MXN') AS Moneda,
            ISNULL(tipoCambio,1) AS tipoCambio,
            ISNULL(Subtotal,0) AS Subtotal,
            ISNULL(Descuento,0) AS Descuento,
            ISNULL(TotalRetenidoISR,0) AS TotalRetenidoISR,
            ISNULL(TotalRetenidoIVA,0) AS TotalRetenidoIVA,
            ISNULL(Total,0) AS Total,
            ISNULL(Total,0) * ${TC} AS Total_MXN,
            ISNULL(LugarExpedicion,'') AS LugarExpedicion,
            'Nómina Ingreso' AS TipoNomina
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc AND TipoComprobante='N'
            AND Fecha>=@dateFrom AND Fecha<@dateTo
        ) n
        ORDER BY Fecha DESC
      `),

    // Q3: Retenciones — UNION ALL evita OR para mejor uso de índices
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<RetencionCFDI>(`
        SELECT TOP 10 * FROM (
          SELECT
            UUID, Fecha, ISNULL(Status,'') AS Status,
            ISNULL(TipoComprobante,'') AS TipoComprobante,
            ISNULL(RFC_Emisor,'') AS RFC_Emisor,
            ISNULL(RazonSocialEmisor,'') AS RazonSocialEmisor,
            ISNULL(RFC_Receptor,'') AS RFC_Receptor,
            ISNULL(RazonSocialReceptor,'') AS RazonSocialReceptor,
            ISNULL(Moneda,'MXN') AS Moneda,
            ISNULL(tipoCambio,1) AS tipoCambio,
            ISNULL(Total,0) AS Total,
            ISNULL(Total,0) * ${TC} AS Total_MXN,
            ISNULL(TotalRetenidoISR,0)  AS TotalRetenidoISR,
            ISNULL(TotalRetenidoIVA,0)  AS TotalRetenidoIVA,
            ISNULL(TotalRetenidoIEPS,0) AS TotalRetenidoIEPS,
            ISNULL(TotalRetenidos,0)    AS TotalRetenidos,
            ISNULL(TotalRetenidoISR,0)  * ${TC} AS ISR_MXN,
            ISNULL(TotalRetenidoIVA,0)  * ${TC} AS IVA_Ret_MXN,
            'Emitida' AS Direccion
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Emisor=@rfc
            AND (TotalRetenidoISR>0 OR TotalRetenidoIVA>0 OR TotalRetenidoIEPS>0)
            AND Fecha>=@dateFrom AND Fecha<@dateTo
          UNION ALL
          SELECT
            UUID, Fecha, ISNULL(Status,'') AS Status,
            ISNULL(TipoComprobante,'') AS TipoComprobante,
            ISNULL(RFC_Emisor,'') AS RFC_Emisor,
            ISNULL(RazonSocialEmisor,'') AS RazonSocialEmisor,
            ISNULL(RFC_Receptor,'') AS RFC_Receptor,
            ISNULL(RazonSocialReceptor,'') AS RazonSocialReceptor,
            ISNULL(Moneda,'MXN') AS Moneda,
            ISNULL(tipoCambio,1) AS tipoCambio,
            ISNULL(Total,0) AS Total,
            ISNULL(Total,0) * ${TC} AS Total_MXN,
            ISNULL(TotalRetenidoISR,0)  AS TotalRetenidoISR,
            ISNULL(TotalRetenidoIVA,0)  AS TotalRetenidoIVA,
            ISNULL(TotalRetenidoIEPS,0) AS TotalRetenidoIEPS,
            ISNULL(TotalRetenidos,0)    AS TotalRetenidos,
            ISNULL(TotalRetenidoISR,0)  * ${TC} AS ISR_MXN,
            ISNULL(TotalRetenidoIVA,0)  * ${TC} AS IVA_Ret_MXN,
            'Recibida' AS Direccion
          FROM facturalo_cfdis WITH (NOLOCK)
          WHERE RFC_Receptor=@rfc
            AND (TotalRetenidoISR>0 OR TotalRetenidoIVA>0 OR TotalRetenidoIEPS>0)
            AND Fecha>=@dateFrom AND Fecha<@dateTo
        ) r
        ORDER BY Fecha DESC
      `),
  ]);

  return {
    ingresos:    ingresosRes.recordset,
    egresos:     egresosRes.recordset,
    nomina:      nominaRes.recordset,
    retenciones: retencionesRes.recordset,
  };
}

// ─── Export query (raw individual rows for formato.js-style Excel) ─────────────

export interface RawCFDIExport {
  UUID: string;
  Fecha: Date;
  RFC_Emisor: string;
  RegimenFiscal: string;
  RFC_Receptor: string;
  RegimenFiscalReceptor: string;
  Subtotal: number;
  IVA8: number;
  IVA16: number;
  TotalTrasladado: number;
  RetISR: number;
  RetIVA: number;
  Descuento: number;
  Total: number;
  Moneda: string;
  tipoCambio: number;
  Movimiento: string;
  TipoComprobante: string;
  TipoPago: string;
  MetodoPago: string;
  UsoCFDI: string;
}

export async function fetchRawCFDIForExport(
  rfc: string,
  dateFrom: Date,
  dateTo: Date
): Promise<RawCFDIExport[]> {
  const db = await getDb();
  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<RawCFDIExport>(`
      SELECT
        UUID,
        Fecha,
        ISNULL(RFC_Emisor,'')                                               AS RFC_Emisor,
        ISNULL(RegimenFiscal,'')                                            AS RegimenFiscal,
        ISNULL(RFC_Receptor,'')                                             AS RFC_Receptor,
        ISNULL(RegimenFiscalReceptor,'')                                    AS RegimenFiscalReceptor,
        TRY_CONVERT(decimal(18,2), ISNULL(Subtotal,0))                     AS Subtotal,
        TRY_CONVERT(decimal(18,2), ISNULL(TotalTrasladadoIVAOcho,0))       AS IVA8,
        TRY_CONVERT(decimal(18,2), ISNULL(TotalTrasladadoIVADieciseis,0))  AS IVA16,
        TRY_CONVERT(decimal(18,2), ISNULL(TotalTrasladado,0))              AS TotalTrasladado,
        TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoISR,0))             AS RetISR,
        TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoIVA,0))             AS RetIVA,
        TRY_CONVERT(decimal(18,2), ISNULL(Descuento,0))                    AS Descuento,
        TRY_CONVERT(decimal(18,2), ISNULL(Total,0))                        AS Total,
        ISNULL(Moneda,'MXN')                                                AS Moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)          AS tipoCambio,
        ISNULL(Movimiento,'')                                               AS Movimiento,
        ISNULL(TipoComprobante,'')                                          AS TipoComprobante,
        ISNULL(TipoPago,'')                                                 AS TipoPago,
        ISNULL(MetodoPago,'')                                               AS MetodoPago,
        ISNULL(UsoCFDI,'')                                                  AS UsoCFDI
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND TipoComprobante IN ('I','E','N')
        AND UPPER(Status)='VIGENTE'
        AND Fecha>=@dateFrom AND Fecha<@dateTo
      ORDER BY Fecha
    `);
  return result.recordset;
}

// ─── Notas de Crédito ─────────────────────────────────────────────────────────

export interface NotaCreditoRow {
  uuid:                  string;
  fecha:                 Date;
  RFC_emisor:            string;
  RegimenFiscal:         string;
  RFC_receptor:          string;
  RegimenFiscalReceptor: string;
  subtotal:              number;
  iva8:                  number;
  iva16:                 number;
  totaltrasladados:      number;
  retISR:                number;
  retIVA:                number;
  totalretenidos:        number;
  descuento:             number;
  total:                 number;
  TipoPago:              string;
  Moneda:                string;
  tipoCambio:            number;
  TipoComprobante:       string;
  MetodoPago:            string;
}

export async function fetchNotasCreditoData(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  limit?: number
): Promise<NotaCreditoRow[]> {
  const db = await getDb();
  const top = limit !== undefined ? `TOP ${limit}` : '';

  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<NotaCreditoRow>(`
      SELECT ${top}
        fact.UUID                                                           AS uuid,
        fact.Fecha                                                          AS fecha,
        ISNULL(fact.RFC_Emisor,'')                                          AS RFC_emisor,
        ISNULL(fact.RegimenFiscal,'')                                       AS RegimenFiscal,
        ISNULL(fact.RFC_Receptor,'')                                        AS RFC_receptor,
        ISNULL(fact.RegimenFiscalReceptor,'')                               AS RegimenFiscalReceptor,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.Subtotal,0))                AS subtotal,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalTrasladadoIVAOcho,0))  AS iva8,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalTrasladadoIVADieciseis,0)) AS iva16,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalTrasladado,0))         AS totaltrasladados,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalRetenidoISR,0))        AS retISR,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalRetenidoIVA,0))        AS retIVA,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.TotalRetenidos,0))          AS totalretenidos,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.Descuento,0))               AS descuento,
        TRY_CONVERT(decimal(18,2), ISNULL(fact.Total,0))                   AS total,
        ISNULL(fact.TipoPago,'')                                            AS TipoPago,
        ISNULL(fact.Moneda,'MXN')                                           AS Moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), fact.TipoCambio),0),1)    AS tipoCambio,
        ISNULL(fact.TipoComprobante,'')                                     AS TipoComprobante,
        ISNULL(fact.MetodoPago,'')                                          AS MetodoPago
      FROM facturalo_cfdis fact WITH (NOLOCK)
      WHERE fact.Status = 'VIGENTE'
        AND fact.TipoComprobante = 'E'
        AND (fact.RFC_Emisor = @rfc OR fact.RFC_Receptor = @rfc)
        AND fact.Fecha >= @dateFrom AND fact.Fecha < @dateTo
      ORDER BY fact.Fecha
    `);
  return result.recordset;
}

// ─── Efectivamente Pagado ─────────────────────────────────────────────────────

export interface EfectivamentePagadoRow {
  uuid:                string;
  fuente:              string;   // 'Complemento P' | 'Factura PUE'
  fechaEmision:        Date;
  fechaPago:           Date | null;
  RFC_emisor:          string;
  RazonSocialEmisor:   string;
  RFC_receptor:        string;
  RazonSocialReceptor: string;
  formaPago:           string;
  moneda:              string;
  tipoCambio:          number;
  subtotal:            number;
  iva:                 number;
  retISR:              number;
  retIVA:              number;
  total:               number;
}

export async function fetchEfectivamentePagado(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  limit?: number
): Promise<EfectivamentePagadoRow[]> {
  const db = await getDb();
  const top = limit !== undefined ? `TOP ${limit}` : '';
  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<EfectivamentePagadoRow>(`
      SELECT ${top} * FROM (
        -- Complementos de pago (tipo P) — monto tomado de facturalo_pagos
        SELECT
          fc.UUID                                                           AS uuid,
          'Complemento P'                                                   AS fuente,
          fc.Fecha                                                          AS fechaEmision,
          p.fecha_pago                                                      AS fechaPago,
          ISNULL(fc.RFC_Emisor,'')                                          AS RFC_emisor,
          ISNULL(fc.RazonSocialEmisor,'')                                   AS RazonSocialEmisor,
          ISNULL(fc.RFC_Receptor,'')                                        AS RFC_receptor,
          ISNULL(fc.RazonSocialReceptor,'')                                 AS RazonSocialReceptor,
          ISNULL(p.forma_pago,'')                                           AS formaPago,
          ISNULL(p.moneda,'MXN')                                            AS moneda,
          ISNULL(p.tipoCambio, 1)                                           AS tipoCambio,
          ISNULL((SELECT SUM(ISNULL(dd.base,0))     FROM dbo.facturalo_pago_doc_relacionado dd WHERE dd.pago_id = p.id), 0) AS subtotal,
          ISNULL((SELECT SUM(ISNULL(dd.impuesto,0)) FROM dbo.facturalo_pago_doc_relacionado dd WHERE dd.pago_id = p.id), 0) AS iva,
          0                                                                 AS retISR,
          0                                                                 AS retIVA,
          ISNULL(TRY_CONVERT(decimal(18,2), p.monto_total_pagos), 0)       AS total
        FROM dbo.facturalo_cfdis fc WITH (NOLOCK)
        INNER JOIN dbo.facturalo_pagos p WITH (NOLOCK) ON p.UUID = fc.UUID
        WHERE fc.RFC_Emisor = @rfc
          AND fc.TipoComprobante = 'P'
          AND fc.Status = 'Vigente'
          AND fc.Fecha >= @dateFrom AND fc.Fecha < @dateTo

        UNION ALL

        -- Facturas PUE (tipo I, MetodoPago = 'PUE') — pago en una sola exhibición
        SELECT
          UUID                                                              AS uuid,
          'Factura PUE'                                                     AS fuente,
          Fecha                                                             AS fechaEmision,
          NULL                                                              AS fechaPago,
          ISNULL(RFC_Emisor,'')                                             AS RFC_emisor,
          ISNULL(RazonSocialEmisor,'')                                      AS RazonSocialEmisor,
          ISNULL(RFC_Receptor,'')                                           AS RFC_receptor,
          ISNULL(RazonSocialReceptor,'')                                    AS RazonSocialReceptor,
          ISNULL(TipoPago,'')                                               AS formaPago,
          ISNULL(Moneda,'MXN')                                              AS moneda,
          ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), tipoCambio),0), 1)      AS tipoCambio,
          TRY_CONVERT(decimal(18,2), ISNULL(Subtotal,0))                   AS subtotal,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalTrasladado,0))            AS iva,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoISR,0))           AS retISR,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoIVA,0))           AS retIVA,
          TRY_CONVERT(decimal(18,2), ISNULL(Total,0))                      AS total
        FROM dbo.facturalo_cfdis WITH (NOLOCK)
        WHERE RFC_Emisor = @rfc
          AND TipoComprobante = 'I'
          AND MetodoPago = 'PUE'
          AND Status = 'Vigente'
          AND Fecha >= @dateFrom AND Fecha < @dateTo
      ) ep
      ORDER BY fechaEmision DESC
    `);
  return result.recordset;
}

export async function fetchNombreEmpresa(rfc: string): Promise<string> {
  const db = await getDb();
  const r = await db
    .request()
    .input("rfc", sql.NVarChar, rfc)
    .query<{ nombre: string }>(`
      SELECT TOP 1 ISNULL(NULLIF(RazonSocialEmisor,''), @rfc) AS nombre
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE RFC_Emisor=@rfc
      ORDER BY Fecha DESC
    `);
  return r.recordset[0]?.nombre ?? rfc;
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

export interface PagoRow {
  uuid_pago:        string;
  fechaEmision:     Date;
  fechaPago:        Date;
  forma_pago:       string;
  moneda_pago:      string;
  tipoCambio:       number;
  total_pago:       number;
  uuid_relacionado: string;
  moneda_docto:     string;
  numParcialidad:   number;
  saldo_anterior:   number;
  saldo_pagado:     number;
  saldo_insoluto:   number;
  base:             number;
  impuesto:         number;
  tipo_factor:      string;
  tasa_o_cuota:     number;
  importe:          number;
  objetoImpuesto:   string;
  RFC_emisor:       string;
  RFC_receptor:     string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export async function fetchPagosData(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  limit?: number
): Promise<PagoRow[]> {
  const db = await getDb();
  const top = limit !== undefined ? `TOP ${limit}` : '';

  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<PagoRow>(`
      SELECT ${top}
        p.UUID                                           AS uuid_pago,
        fc.Fecha                                         AS fechaEmision,
        p.fecha_pago                                     AS fechaPago,
        ISNULL(p.forma_pago,'')                          AS forma_pago,
        ISNULL(p.moneda,'MXN')                           AS moneda_pago,
        ISNULL(p.tipoCambio, 1)                          AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2), p.monto_total_pagos), 0) AS total_pago,
        ISNULL(d.uuid_doc_relacionado,'')                AS uuid_relacionado,
        ISNULL(d.moneda_pago,'MXN')                      AS moneda_docto,
        ISNULL(d.numParcialidad, 0)                      AS numParcialidad,
        ISNULL(d.saldo_anterior, 0)                      AS saldo_anterior,
        ISNULL(d.saldo_pagado, 0)                        AS saldo_pagado,
        ISNULL(d.saldo_insoluto, 0)                      AS saldo_insoluto,
        ISNULL(d.base, 0)                                AS base,
        ISNULL(d.impuesto, 0)                            AS impuesto,
        ISNULL(d.tipo_factor,'')                         AS tipo_factor,
        ISNULL(d.tasa_o_cuota, 0)                        AS tasa_o_cuota,
        ISNULL(d.importe, 0)                             AS importe,
        ISNULL(d.objetoImpuesto,'')                      AS objetoImpuesto,
        ISNULL(fc.RFC_emisor,'')                         AS RFC_emisor,
        ISNULL(fc.RFC_receptor,'')                       AS RFC_receptor
      FROM dbo.facturalo_pagos p WITH (NOLOCK)
      LEFT JOIN dbo.facturalo_pago_doc_relacionado d WITH (NOLOCK) ON d.pago_id = p.id
      INNER JOIN (
        SELECT DISTINCT UUID, Fecha, RFC_emisor, RFC_receptor
        FROM dbo.facturalo_cfdis WITH (NOLOCK)
        WHERE TipoComprobante = 'P'
          AND status = 'Vigente'
        AND fecha >= @dateFrom AND fecha < @dateTo
      ) fc ON fc.UUID = p.UUID
      WHERE (fc.RFC_emisor = @rfc OR fc.RFC_receptor = @rfc)
        AND p.fecha_pago >= @dateFrom AND p.fecha_pago < @dateTo
      ORDER BY p.fecha_pago, d.numParcialidad
    `);
  return result.recordset;
}

// ─── Estados Financieros ──────────────────────────────────────────────────────

export interface ConceptoRow {
  descripcion:   string;
  claveProdServ: string;
  cantidad:      number;
  importe:       number;
  iva8:          number;
  iva16:         number;
  numFacturas:   number;
}

export interface EstadosFinancierosData {
  ingresos: ConceptoRow[];
  egresos:  ConceptoRow[];
}

export async function fetchEstadosFinancieros(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  limit?: number
): Promise<EstadosFinancierosData> {
  const cacheKey = `${rfc}|${dateFrom.toISOString()}|${dateTo.toISOString()}|${limit ?? 'all'}`;
  const hit = _efCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.data;

  const db  = await getDbLong();
  const top = limit !== undefined ? `TOP ${limit}` : '';

  const [ingRes, egrRes] = await Promise.all([
    // Ingresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<ConceptoRow>(`
        SELECT ${top}
          MIN(ISNULL(NULLIF(c.Descripcion,''), CASE WHEN c.UUID IS NULL THEN '(Sin concepto registrado)' ELSE 'Sin descripción' END)) AS descripcion,
          ISNULL(c.ClaveProductoServicio, '')                 AS claveProdServ,
          SUM(ISNULL(c.Cantidad, 0))                         AS cantidad,
          SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe, 0)
                   ELSE ISNULL(f.Subtotal, 0) END
              * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)) AS importe,
          SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
            THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                 / f.Subtotal
                 * ISNULL(f.TotalTrasladadoIVAOcho, 0)
                 * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
            ELSE 0 END)                                      AS iva8,
          SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
            THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                 / f.Subtotal
                 * ISNULL(f.TotalTrasladadoIVADieciseis, 0)
                 * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
            ELSE 0 END)                                      AS iva16,
          COUNT(*)                                           AS numFacturas
        FROM facturalo_cfdis f WITH (NOLOCK)
        LEFT JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID)) ON c.UUID = f.UUID
        WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
          AND UPPER(f.Movimiento)    = 'INGRESO'
          AND f.TipoComprobante      IN ('I','E')
          AND UPPER(f.Status)        = 'VIGENTE'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        GROUP BY ISNULL(c.ClaveProductoServicio, '')
        ORDER BY SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                     * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio),0),1)) DESC
        OPTION (HASH GROUP, RECOMPILE)
      `),

    // Egresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<ConceptoRow>(`
        SELECT ${top}
          MIN(ISNULL(NULLIF(c.Descripcion,''), CASE WHEN c.UUID IS NULL THEN '(Sin concepto registrado)' ELSE 'Sin descripción' END)) AS descripcion,
          ISNULL(c.ClaveProductoServicio, '')                 AS claveProdServ,
          SUM(ISNULL(c.Cantidad, 0))                         AS cantidad,
          SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe, 0)
                   ELSE ISNULL(f.Subtotal, 0) END
              * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)) AS importe,
          SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
            THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                 / f.Subtotal
                 * ISNULL(f.TotalTrasladadoIVAOcho, 0)
                 * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
            ELSE 0 END)                                      AS iva8,
          SUM(CASE WHEN ISNULL(f.Subtotal,0) > 0
            THEN CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                 / f.Subtotal
                 * ISNULL(f.TotalTrasladadoIVADieciseis, 0)
                 * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1)
            ELSE 0 END)                                      AS iva16,
          COUNT(*)                                           AS numFacturas
        FROM facturalo_cfdis f WITH (NOLOCK)
        LEFT JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID)) ON c.UUID = f.UUID
        WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
          AND UPPER(f.Movimiento)    = 'EGRESO'
          AND f.TipoComprobante      IN ('I','E')
          AND UPPER(f.Status)        = 'VIGENTE'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        GROUP BY ISNULL(c.ClaveProductoServicio, '')
        ORDER BY SUM(CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe,0) ELSE ISNULL(f.Subtotal,0) END
                     * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio),0),1)) DESC
        OPTION (HASH GROUP, RECOMPILE)
      `),
  ]);

  const data: EstadosFinancierosData = {
    ingresos: ingRes.recordset,
    egresos:  egrRes.recordset,
  };
  _efCache.set(cacheKey, { data, exp: Date.now() + EF_TTL_MS });
  return data;
}

// ─── Chat Context ─────────────────────────────────────────────────────────────

export interface CFDIConceptoChat {
  descripcion:   string;
  claveProdServ: string;
  cantidad:      number;
  importe:       number;
  descuento:     number;
}

export interface CFDIPagoChat {
  fechaPago:  string;
  formaPago:  string;
  moneda:     string;
  tipoCambio: number;
  monto:      number;
}

export interface CFDIForChat {
  uuid:                string;
  fecha:               Date;
  tipoComprobante:     string;
  movimiento:          string;
  status:              string;
  serie:               string;
  folio:               string;
  rfcEmisor:           string;
  razonSocialEmisor:   string;
  rfcReceptor:         string;
  razonSocialReceptor: string;
  usoCFDI:             string;
  metodoPago:          string;
  formaPago:           string;
  moneda:              string;
  tipoCambio:          number;
  subtotal:            number;
  descuento:           number;
  totalIVA:            number;
  totalIVA8:           number;
  totalIVA16:          number;
  totalISR:            number;
  totalIVARet:         number;
  total:               number;
  regimenFiscal:       string;
  lugarExpedicion:     string;
  conceptos:           CFDIConceptoChat[];
  pagos:               CFDIPagoChat[];
}

export async function countFacturasParaChat(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<number> {
  const db = await getDb();
  const r = await db.request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor = @rfc OR RFC_Receptor = @rfc)
        AND Fecha >= @dateFrom AND Fecha < @dateTo
        AND TipoComprobante IN ('I','E','N','P')
    `);
  return r.recordset[0]?.total ?? 0;
}

export async function fetchFacturasParaChat(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  maxCFDIs = 60,
): Promise<CFDIForChat[]> {
  const db = await getDb();

  interface CFDIRow {
    uuid: string; fecha: Date;
    tipoComprobante: string; movimiento: string; status: string;
    serie: string; folio: string;
    rfcEmisor: string; razonSocialEmisor: string;
    rfcReceptor: string; razonSocialReceptor: string;
    usoCFDI: string; metodoPago: string; formaPago: string;
    moneda: string; tipoCambio: number;
    subtotal: number; descuento: number;
    totalIVA: number; totalIVA8: number; totalIVA16: number; totalISR: number; totalIVARet: number; total: number;
    regimenFiscal: string; lugarExpedicion: string;
  }

  const cfdisRes = await db.request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .input("maxCFDIs", sql.Int,        maxCFDIs)
    .query<CFDIRow>(`
      SELECT TOP (@maxCFDIs)
        UUID                                                           AS uuid,
        Fecha                                                          AS fecha,
        ISNULL(TipoComprobante,'')                                     AS tipoComprobante,
        ISNULL(Movimiento,'')                                          AS movimiento,
        ISNULL(Status,'')                                              AS status,
        ISNULL(Serie,'')                                               AS serie,
        ISNULL(Folio,'')                                               AS folio,
        ISNULL(RFC_Emisor,'')                                          AS rfcEmisor,
        ISNULL(RazonSocialEmisor,'')                                   AS razonSocialEmisor,
        ISNULL(RFC_Receptor,'')                                        AS rfcReceptor,
        ISNULL(RazonSocialReceptor,'')                                 AS razonSocialReceptor,
        ISNULL(UsoCFDI,'')                                             AS usoCFDI,
        ISNULL(MetodoPago,'')                                          AS metodoPago,
        ISNULL(TipoPago,'')                                            AS formaPago,
        ISNULL(Moneda,'MXN')                                           AS moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)     AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),Subtotal),0)                 AS subtotal,
        ISNULL(TRY_CONVERT(decimal(18,2),Descuento),0)                AS descuento,
        ISNULL(TRY_CONVERT(decimal(18,2),TotalTrasladado),0)          AS totalIVA,
        ISNULL(TRY_CONVERT(decimal(18,2),TotalTrasladadoIVAOcho),0)    AS totalIVA8,
        ISNULL(TRY_CONVERT(decimal(18,2),TotalTrasladadoIVADieciseis),0) AS totalIVA16,
        ISNULL(TRY_CONVERT(decimal(18,2),TotalRetenidoISR),0)         AS totalISR,
        ISNULL(TRY_CONVERT(decimal(18,2),TotalRetenidoIVA),0)         AS totalIVARet,
        ISNULL(TRY_CONVERT(decimal(18,2),Total),0)                    AS total,
        ISNULL(RegimenFiscal,'')                                       AS regimenFiscal,
        ISNULL(LugarExpedicion,'')                                     AS lugarExpedicion
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor = @rfc OR RFC_Receptor = @rfc)
        AND Fecha >= @dateFrom AND Fecha < @dateTo
        AND TipoComprobante IN ('I','E','N','P')
      ORDER BY Fecha DESC
    `);

  const cfdis = cfdisRes.recordset;
  if (cfdis.length === 0) return [];

  const uuidList = cfdis.map(c => `'${c.uuid.replace(/'/g, "''")}'`).join(",");

  interface ConceptoRaw extends CFDIConceptoChat { uuid: string }
  const conceptosRes = await db.request().query<ConceptoRaw>(`
    SELECT uuid, descripcion, claveProdServ, cantidad, importe, descuento
    FROM (
      SELECT
        UUID                                                AS uuid,
        ISNULL(NULLIF(Descripcion,''), '—')                AS descripcion,
        ISNULL(ClaveProductoServicio,'')                   AS claveProdServ,
        ISNULL(TRY_CONVERT(decimal(18,4),Cantidad),0)     AS cantidad,
        ISNULL(TRY_CONVERT(decimal(18,2),Importe),0)      AS importe,
        ISNULL(TRY_CONVERT(decimal(18,2),Descuento),0)    AS descuento,
        ROW_NUMBER() OVER (PARTITION BY UUID ORDER BY (SELECT NULL)) AS rn
      FROM facturalo_conceptos WITH (NOLOCK)
      WHERE UUID IN (${uuidList})
    ) t WHERE rn <= 100
  `);

  interface PagoRaw extends CFDIPagoChat { uuid: string }
  const pagosRes = await db.request().query<PagoRaw>(`
    SELECT uuid, fechaPago, formaPago, moneda, tipoCambio, monto
    FROM (
      SELECT
        p.UUID                                                        AS uuid,
        CONVERT(varchar(10), p.fecha_pago, 23)                        AS fechaPago,
        ISNULL(p.forma_pago,'')                                        AS formaPago,
        ISNULL(p.moneda,'MXN')                                         AS moneda,
        ISNULL(p.tipoCambio,1)                                         AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),p.monto_total_pagos),0)      AS monto,
        ROW_NUMBER() OVER (PARTITION BY p.UUID ORDER BY p.fecha_pago) AS rn
      FROM facturalo_pagos p WITH (NOLOCK)
      WHERE p.UUID IN (${uuidList})
    ) t WHERE rn <= 50
  `);

  const conceptosByUUID = new Map<string, CFDIConceptoChat[]>();
  for (const { uuid, ...rest } of conceptosRes.recordset) {
    if (!conceptosByUUID.has(uuid)) conceptosByUUID.set(uuid, []);
    conceptosByUUID.get(uuid)!.push(rest);
  }

  const pagosByUUID = new Map<string, CFDIPagoChat[]>();
  for (const { uuid, ...rest } of pagosRes.recordset) {
    if (!pagosByUUID.has(uuid)) pagosByUUID.set(uuid, []);
    pagosByUUID.get(uuid)!.push(rest);
  }

  return cfdis.map(c => ({
    ...c,
    conceptos: conceptosByUUID.get(c.uuid) ?? [],
    pagos:     pagosByUUID.get(c.uuid) ?? [],
  }));
}
