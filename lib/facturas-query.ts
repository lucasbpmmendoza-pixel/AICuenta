import sql from "mssql";
import { getDb, getDbLong } from "@/lib/db";
import { rfcAlias } from "@/lib/rfc-aliases";

// ─── Cache en memoria para fetchEstadosFinancieros ────────────────────────────
// TTL 15 min: consulta muy pesada (~2 min) — se cachea por RFC+rango+limit
const _efCache = new Map<string, { data: EstadosFinancierosData; exp: number }>();
const EF_TTL_MS = 15 * 60 * 1000;

export function clearEfCache() { _efCache.clear(); }

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
  NominaDeducciones?: string | null;
}

export async function fetchRawCFDIForExport(
  rfc: string,
  dateFrom: Date,
  dateTo: Date
): Promise<RawCFDIExport[]> {
  const db = await getDb();

  const columns = await db.request().query<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturalo_cfdis'
      AND COLUMN_NAME IN ('NominaDeducciones', 'nomina_deducciones', 'nominaDeducciones')
  `);
  const nominaCol = columns.recordset[0]?.COLUMN_NAME ?? null;
  const nominaSelect = nominaCol
    ? `TRY_CONVERT(nvarchar(max), [${nominaCol.replace(/\]/g, "]]" )}]) AS NominaDeducciones`
    : `CAST(NULL AS nvarchar(max)) AS NominaDeducciones`;

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
        CASE
          WHEN RFC_Emisor = @rfc AND TipoComprobante = 'N' THEN 'Egreso'
          WHEN RFC_Receptor = @rfc AND TipoComprobante = 'N' THEN 'Ingreso'
          WHEN RFC_Emisor = @rfc AND TipoComprobante = 'I' THEN 'Ingreso'
          WHEN RFC_Receptor = @rfc AND TipoComprobante = 'I' THEN 'Egreso'
          WHEN RFC_Emisor = @rfc AND TipoComprobante = 'E' THEN 'Egreso'
          WHEN RFC_Receptor = @rfc AND TipoComprobante = 'E' THEN 'Ingreso'
          ELSE ISNULL(Movimiento,'')
        END                                                                 AS Movimiento,
        ISNULL(TipoComprobante,'')                                          AS TipoComprobante,
        ISNULL(TipoPago,'')                                                 AS TipoPago,
        ISNULL(MetodoPago,'')                                               AS MetodoPago,
        ISNULL(UsoCFDI,'')                                                  AS UsoCFDI,
        ${nominaSelect}
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (
              (RFC_Emisor   = @rfc AND TipoComprobante = 'I' AND UPPER(Movimiento) = 'INGRESO')
           OR (RFC_Emisor   = @rfc AND TipoComprobante = 'N')
           OR (RFC_Receptor = @rfc AND TipoComprobante = 'N')
           OR (RFC_Emisor   = @rfc AND TipoComprobante = 'E' AND UPPER(Movimiento) = 'EGRESO')
           OR (RFC_Receptor = @rfc AND TipoComprobante = 'I' AND UPPER(Movimiento) = 'EGRESO')
           OR (RFC_Receptor = @rfc AND TipoComprobante = 'E' AND UPPER(Movimiento) = 'INGRESO')
            )
        AND UPPER(Status) = 'VIGENTE'
        AND Fecha >= @dateFrom AND Fecha < @dateTo
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

export interface flujoRow {
  uuid:                string;
  fuente:              string;   // 'Complemento P' | 'Factura PUE'
  fechaEmision:        Date;
  fechaPago:           Date | null;
  uuidDocumentoRelacionado: string;
  RFC_emisor:          string;
  RazonSocialEmisor:   string;
  RFC_receptor:        string;
  RazonSocialReceptor: string;
  formaPago:           string;
  moneda:              string;
  tipoCambio:          number;
  subtotal:            number;
  importe_pagado:      number;
  tasa_o_cuota:        number;
  importe_impuesto:    number;
  retISR:              number;
  retIVA:              number;
  total:               number;
  iva:                 number;
  movimiento:          "INGRESO" | "EGRESO";

}

export async function fetchflujo(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  limit?: number
): Promise<flujoRow[]> {
  const db = await getDb();
  const top = limit !== undefined ? `TOP ${limit}` : '';
  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query<flujoRow>(`
      SELECT ${top} * FROM (
        -- Complementos de pago (tipo P) — monto tomado de facturalo_pagos
        SELECT
          fc.UUID                                                           AS uuid,
          ISNULL((
            SELECT STRING_AGG(CONVERT(nvarchar(50), ISNULL(dd.uuid_doc_relacionado,'')), ', ')
            FROM dbo.facturalo_pago_doc_relacionado dd
            WHERE dd.pago_id = p.id
          ), '')                                                            AS uuidDocumentoRelacionado,
          'Complemento P'                                                   AS fuente,
          CASE WHEN fc.RFC_Emisor = @rfc THEN 'INGRESO' ELSE 'EGRESO' END  AS movimiento,
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
          ISNULL((SELECT SUM(ISNULL(dd.saldo_pagado,0)) FROM dbo.facturalo_pago_doc_relacionado dd WHERE dd.pago_id = p.id), 0) AS importe_pagado,
          ISNULL((SELECT TOP 1 ISNULL(dd.tasa_o_cuota,0) FROM dbo.facturalo_pago_doc_relacionado dd WHERE dd.pago_id = p.id ORDER BY dd.numParcialidad DESC, dd.id DESC), 0) AS tasa_o_cuota,
          ISNULL(
            TRY_CONVERT(decimal(18,2), p.total_trasladados_impuesto),
            ISNULL(TRY_CONVERT(decimal(18,2), p.total_trasladados_impuesto), 0)
          ) AS importe_impuesto,
          0                                                                 AS retISR,
          0                                                                 AS retIVA,
          ISNULL(TRY_CONVERT(decimal(18,2), p.monto_total_pagos), 0)       AS total
        FROM dbo.facturalo_cfdis fc WITH (NOLOCK)
        INNER JOIN dbo.facturalo_pagos p WITH (NOLOCK) ON p.UUID = fc.UUID
        WHERE (fc.RFC_Emisor = @rfc OR fc.RFC_Receptor = @rfc)
          AND fc.TipoComprobante = 'P'
          AND fc.Status = 'Vigente'
          AND fc.Fecha >= @dateFrom AND fc.Fecha < @dateTo

        UNION ALL

        -- Facturas PUE (tipo I, MetodoPago = 'PUE') — pago en una sola exhibición
        SELECT
          UUID                                                              AS uuid,
          ''                                                                AS uuidDocumentoRelacionado,
          'Factura PUE'                                                     AS fuente,
          CASE WHEN RFC_Emisor = @rfc THEN 'INGRESO' ELSE 'EGRESO' END     AS movimiento,
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
          TRY_CONVERT(decimal(18,2), ISNULL(Subtotal,0))                   AS importe_pagado,
          0                                                               AS tasa_o_cuota,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalTrasladado,0))            AS importe_impuesto,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoISR,0))           AS retISR,
          TRY_CONVERT(decimal(18,2), ISNULL(TotalRetenidoIVA,0))           AS retIVA,
          TRY_CONVERT(decimal(18,2), ISNULL(Total,0))                      AS total
        FROM dbo.facturalo_cfdis WITH (NOLOCK)
        WHERE (RFC_Emisor = @rfc OR RFC_Receptor = @rfc)
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
  const alias = rfcAlias(rfc);
  if (alias) return alias;
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
  totalFacturasIngresos: number;
  totalFacturasEgresos:  number;
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

  const [ingRes, egrRes, totIngRes, totEgrRes] = await Promise.all([
    // Ingresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<ConceptoRow>(`
        WITH base AS (
          SELECT
            ISNULL(NULLIF(c.ClaveProductoServicio,''), '') AS claveProdServ,
            ISNULL(NULLIF(cat.descripcion,''), CASE WHEN c.UUID IS NULL THEN '(Sin concepto registrado)' ELSE 'Sin descripción SAT' END) AS descripcion,
            ISNULL(c.Cantidad, 0) AS cantidad,
            CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe, 0) ELSE ISNULL(f.Subtotal, 0) END AS importeBase,
            ISNULL(f.Subtotal, 0) AS subtotalBase,
            ISNULL(f.TotalTrasladadoIVAOcho, 0) AS iva8Base,
            ISNULL(f.TotalTrasladadoIVADieciseis, 0) AS iva16Base,
            ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1) AS tipoCambio,
            f.UUID AS uuid
          FROM facturalo_cfdis f WITH (NOLOCK)
          LEFT JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID)) ON c.UUID = f.UUID AND c.rfc_cliente = @rfc
          LEFT JOIN tb_catprodserv cat WITH (NOLOCK) ON cat.clave = c.ClaveProductoServicio
          WHERE (
                  (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'INGRESO')
               OR (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'INGRESO')
                )
            AND UPPER(f.Status) = 'VIGENTE'
            AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        )
        SELECT ${top}
          MIN(descripcion) AS descripcion,
          claveProdServ,
          SUM(cantidad) AS cantidad,
          SUM(importeBase * tipoCambio) AS importe,
          SUM(CASE WHEN subtotalBase > 0
              THEN (importeBase / subtotalBase) * iva8Base * tipoCambio
              ELSE 0 END) AS iva8,
          SUM(CASE WHEN subtotalBase > 0
              THEN (importeBase / subtotalBase) * iva16Base * tipoCambio
              ELSE 0 END) AS iva16,
          COUNT(DISTINCT uuid) AS numFacturas
        FROM base
        GROUP BY claveProdServ
        ORDER BY SUM(importeBase * tipoCambio) DESC
        OPTION (HASH GROUP, RECOMPILE)
      `),

    // Egresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<ConceptoRow>(`
        WITH base AS (
          SELECT
            ISNULL(NULLIF(c.ClaveProductoServicio,''), '') AS claveProdServ,
            ISNULL(NULLIF(cat.descripcion,''), CASE WHEN c.UUID IS NULL THEN '(Sin concepto registrado)' ELSE 'Sin descripción SAT' END) AS descripcion,
            ISNULL(c.Cantidad, 0) AS cantidad,
            CASE WHEN c.UUID IS NOT NULL THEN ISNULL(c.Importe, 0) ELSE ISNULL(f.Subtotal, 0) END AS importeBase,
            ISNULL(f.Subtotal, 0) AS subtotalBase,
            ISNULL(f.TotalTrasladadoIVAOcho, 0) AS iva8Base,
            ISNULL(f.TotalTrasladadoIVADieciseis, 0) AS iva16Base,
            ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1) AS tipoCambio,
            f.UUID AS uuid
          FROM facturalo_cfdis f WITH (NOLOCK)
          LEFT JOIN facturalo_conceptos c WITH (NOLOCK, INDEX(IX_conceptos_UUID)) ON c.UUID = f.UUID AND c.rfc_cliente = @rfc
          LEFT JOIN tb_catprodserv cat WITH (NOLOCK) ON cat.clave = c.ClaveProductoServicio
          WHERE (
                  (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
               OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
                )
            AND UPPER(f.Status) = 'VIGENTE'
            AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        )
        SELECT ${top}
          MIN(descripcion) AS descripcion,
          claveProdServ,
          SUM(cantidad) AS cantidad,
          SUM(importeBase * tipoCambio) AS importe,
          SUM(CASE WHEN subtotalBase > 0
              THEN (importeBase / subtotalBase) * iva8Base * tipoCambio
              ELSE 0 END) AS iva8,
          SUM(CASE WHEN subtotalBase > 0
              THEN (importeBase / subtotalBase) * iva16Base * tipoCambio
              ELSE 0 END) AS iva16,
          COUNT(DISTINCT uuid) AS numFacturas
        FROM base
        GROUP BY claveProdServ
        ORDER BY SUM(importeBase * tipoCambio) DESC
        OPTION (HASH GROUP, RECOMPILE)
      `),

    // Total facturas ingresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<{ total: number }>(`
        SELECT COUNT(DISTINCT f.UUID) AS total
        FROM facturalo_cfdis f WITH (NOLOCK)
        WHERE (
                (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'INGRESO')
             OR (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'INGRESO')
              )
          AND UPPER(f.Status) = 'VIGENTE'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      `),

    // Total facturas egresos
    db.request()
      .input("rfc",      sql.NVarChar, rfc)
      .input("dateFrom", sql.DateTime,  dateFrom)
      .input("dateTo",   sql.DateTime,  dateTo)
      .query<{ total: number }>(`
        SELECT COUNT(DISTINCT f.UUID) AS total
        FROM facturalo_cfdis f WITH (NOLOCK)
        WHERE (
                (f.RFC_Receptor = @rfc AND f.TipoComprobante = 'I' AND UPPER(f.Movimiento) = 'EGRESO')
             OR (f.RFC_Emisor   = @rfc AND f.TipoComprobante = 'E' AND UPPER(f.Movimiento) = 'EGRESO')
              )
          AND UPPER(f.Status) = 'VIGENTE'
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
      `),
  ]);

  const data: EstadosFinancierosData = {
    ingresos: ingRes.recordset,
    egresos:  egrRes.recordset,
    totalFacturasIngresos: totIngRes.recordset[0]?.total ?? 0,
    totalFacturasEgresos:  totEgrRes.recordset[0]?.total ?? 0,
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

export interface ChatCFDISearchFilters {
  movimiento?: "INGRESO" | "EGRESO";
  tipoComprobante?: "I" | "E" | "N" | "P";
  searchText?: string;
  limit?: number;
}

export interface ChatCFDIAggregateFilters {
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS";
  tipoComprobante?: "I" | "E" | "N" | "P";
  groupBy?: "none" | "mes" | "rfcEmisor" | "rfcReceptor" | "razonSocialEmisor" | "razonSocialReceptor" | "tipoComprobante";
  top?: number;
}

export async function chatSearchCFDIs(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatCFDISearchFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const searchText = (filters.searchText ?? "").trim();
  const searchPrefix = searchText ? `${searchText}%` : null;
  const searchContains = searchText.length >= 4 ? `%${searchText}%` : null;

  const req = db.request();

  const res = await req
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .input("movimiento", sql.NVarChar, filters.movimiento ?? null)
    .input("tipo", sql.NVarChar, filters.tipoComprobante ?? null)
    .input("searchExact", sql.NVarChar, searchText || null)
    .input("searchPrefix", sql.NVarChar, searchPrefix)
    .input("searchContains", sql.NVarChar, searchContains)
    .query(`
      SELECT TOP (@limit)
        ISNULL(f.UUID,'')                                                     AS uuid,
        f.Fecha                                                               AS fecha,
        ISNULL(f.TipoComprobante,'')                                          AS tipoComprobante,
        CASE WHEN f.RFC_Emisor = @rfc
             THEN 'INGRESO' ELSE 'EGRESO' END                                 AS movimiento,
        ISNULL(f.Status,'')                                                   AS status,
        ISNULL(f.RFC_Emisor,'')                                               AS rfcEmisor,
        ISNULL(f.RazonSocialEmisor,'')                                        AS razonSocialEmisor,
        ISNULL(f.RFC_Receptor,'')                                             AS rfcReceptor,
        ISNULL(f.RazonSocialReceptor,'')                                      AS razonSocialReceptor,
        ISNULL(f.MetodoPago,'')                                               AS metodoPago,
        ISNULL(f.TipoPago,'')                                                 AS formaPago,
        ISNULL(f.Moneda,'MXN')                                                AS moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)          AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),f.TotalTrasladado),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS iva,
        ISNULL(TRY_CONVERT(decimal(18,2),f.Total),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS total
      FROM facturalo_cfdis f WITH (NOLOCK)
      WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        AND f.TipoComprobante IN ('I','E','N','P')
        AND (
          @movimiento IS NULL OR
          @movimiento = 'AMBOS' OR
          (@movimiento = 'INGRESO' AND f.RFC_Emisor = @rfc) OR
          (@movimiento = 'EGRESO' AND f.RFC_Receptor = @rfc AND f.RFC_Emisor <> @rfc)
        )
        AND (@tipo IS NULL OR f.TipoComprobante = @tipo)
        AND (
          @searchExact IS NULL OR
          f.UUID = @searchExact OR
          ISNULL(f.RFC_Emisor,'') LIKE @searchPrefix OR
          ISNULL(f.RFC_Receptor,'') LIKE @searchPrefix OR
          (@searchContains IS NOT NULL AND (
            ISNULL(f.RazonSocialEmisor,'') LIKE @searchContains OR
            ISNULL(f.RazonSocialReceptor,'') LIKE @searchContains
          ))
        )
      ORDER BY f.Fecha DESC
    `);

  return {
    count: res.recordset.length,
    rows: res.recordset,
  };
}

export async function chatAggregateCFDIs(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatCFDIAggregateFilters = {},
) {
  const db = await getDbLong();
  const top = Math.max(1, Math.min(filters.top ?? 25, 100));
  const movimiento = filters.movimiento ?? "AMBOS";
  const groupBy = filters.groupBy ?? "none";

  const req = db.request();

  const res = await req
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("top", sql.Int, top)
    .input("movimiento", sql.NVarChar, movimiento)
    .input("tipo", sql.NVarChar, filters.tipoComprobante ?? null)
    .input("groupBy", sql.NVarChar, groupBy)
    .query(`
      WITH base AS (
        SELECT
          f.Fecha                                                          AS fecha,
          ISNULL(f.TipoComprobante,'')                                     AS tipoComprobante,
          CASE WHEN f.RFC_Emisor = @rfc
               THEN 'INGRESO' ELSE 'EGRESO' END                            AS movimiento,
          ISNULL(f.RFC_Emisor,'')                                          AS rfcEmisor,
          ISNULL(f.RFC_Receptor,'')                                        AS rfcReceptor,
          ISNULL(f.RazonSocialEmisor,'')                                   AS razonSocialEmisor,
          ISNULL(f.RazonSocialReceptor,'')                                 AS razonSocialReceptor,
          ISNULL(TRY_CONVERT(decimal(18,2),f.Subtotal),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)  AS subtotal,
          ISNULL(TRY_CONVERT(decimal(18,2),f.TotalTrasladado),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)  AS iva,
          ISNULL(TRY_CONVERT(decimal(18,2),f.TotalRetenidoISR),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)  AS retISR,
          ISNULL(TRY_CONVERT(decimal(18,2),f.TotalRetenidoIVA),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)  AS retIVA,
          ISNULL(TRY_CONVERT(decimal(18,2),f.Total),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)  AS total
        FROM facturalo_cfdis f WITH (NOLOCK)
        WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
          AND f.TipoComprobante IN ('I','E','N','P')
          AND (
            @movimiento = 'AMBOS' OR
            (@movimiento = 'INGRESO' AND f.RFC_Emisor = @rfc) OR
            (@movimiento = 'EGRESO' AND f.RFC_Receptor = @rfc AND f.RFC_Emisor <> @rfc)
          )
          AND (@tipo IS NULL OR f.TipoComprobante = @tipo)
      )
      SELECT TOP (@top)
        CASE
          WHEN @groupBy = 'mes' THEN CONVERT(varchar(7), fecha, 120)
          WHEN @groupBy = 'rfcEmisor' THEN rfcEmisor
          WHEN @groupBy = 'rfcReceptor' THEN rfcReceptor
          WHEN @groupBy = 'razonSocialEmisor' THEN razonSocialEmisor
          WHEN @groupBy = 'razonSocialReceptor' THEN razonSocialReceptor
          WHEN @groupBy = 'tipoComprobante' THEN tipoComprobante
          ELSE 'TOTAL'
        END                                                                AS groupKey,
        COUNT(1)                                                           AS cfdis,
        SUM(subtotal)                                                      AS subtotal,
        SUM(iva)                                                           AS iva,
        SUM(retISR)                                                        AS retISR,
        SUM(retIVA)                                                        AS retIVA,
        SUM(total)                                                         AS total
      FROM base
      GROUP BY CASE
          WHEN @groupBy = 'mes' THEN CONVERT(varchar(7), fecha, 120)
          WHEN @groupBy = 'rfcEmisor' THEN rfcEmisor
          WHEN @groupBy = 'rfcReceptor' THEN rfcReceptor
          WHEN @groupBy = 'razonSocialEmisor' THEN razonSocialEmisor
          WHEN @groupBy = 'razonSocialReceptor' THEN razonSocialReceptor
          WHEN @groupBy = 'tipoComprobante' THEN tipoComprobante
          ELSE 'TOTAL'
        END
      ORDER BY total DESC
    `);

  return {
    movimiento,
    groupBy,
    rows: res.recordset,
  };
}

export async function chatGetCFDIDetail(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  uuid: string,
) {
  const db = await getDb();

  const headRes = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("uuid", sql.NVarChar, uuid)
    .query(`
      SELECT TOP (1)
        ISNULL(f.UUID,'')                                                     AS uuid,
        f.Fecha                                                               AS fecha,
        ISNULL(f.TipoComprobante,'')                                          AS tipoComprobante,
        CASE WHEN UPPER(ISNULL(f.RFC_Emisor,'')) = UPPER(@rfc)
             THEN 'INGRESO' ELSE 'EGRESO' END                                 AS movimiento,
        ISNULL(f.Status,'')                                                   AS status,
        ISNULL(f.RFC_Emisor,'')                                               AS rfcEmisor,
        ISNULL(f.RazonSocialEmisor,'')                                        AS razonSocialEmisor,
        ISNULL(f.RFC_Receptor,'')                                             AS rfcReceptor,
        ISNULL(f.RazonSocialReceptor,'')                                      AS razonSocialReceptor,
        ISNULL(f.MetodoPago,'')                                               AS metodoPago,
        ISNULL(f.TipoPago,'')                                                 AS formaPago,
        ISNULL(f.Moneda,'MXN')                                                AS moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)          AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),f.Subtotal),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS subtotal,
        ISNULL(TRY_CONVERT(decimal(18,2),f.TotalTrasladado),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS iva,
        ISNULL(TRY_CONVERT(decimal(18,2),f.TotalRetenidoISR),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS retISR,
        ISNULL(TRY_CONVERT(decimal(18,2),f.TotalRetenidoIVA),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS retIVA,
        ISNULL(TRY_CONVERT(decimal(18,2),f.Total),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS total
      FROM facturalo_cfdis f WITH (NOLOCK)
      WHERE f.UUID = @uuid
        AND (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
    `);

  const header = headRes.recordset[0];
  if (!header) return null;

  const [conceptosRes, pagosRes, docsRes] = await Promise.all([
    db.request().input("uuid", sql.NVarChar, uuid).query(`
      SELECT TOP (60)
        ISNULL(NULLIF(c.ClaveProductoServicio,''),'')                         AS claveProdServ,
        ISNULL(NULLIF(c.Descripcion,''),'Sin descripción')                    AS descripcion,
        ISNULL(TRY_CONVERT(decimal(18,4),c.Cantidad),0)                      AS cantidad,
        ISNULL(TRY_CONVERT(decimal(18,2),c.Importe),0)                       AS importe,
        ISNULL(TRY_CONVERT(decimal(18,2),c.Descuento),0)                     AS descuento
      FROM facturalo_conceptos c WITH (NOLOCK)
      WHERE c.UUID = @uuid
    `),
    db.request().input("uuid", sql.NVarChar, uuid).query(`
      SELECT TOP (50)
        CONVERT(varchar(10), p.fecha_pago, 23)                                AS fechaPago,
        ISNULL(p.forma_pago,'')                                               AS formaPago,
        ISNULL(p.moneda,'MXN')                                                AS moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),p.tipoCambio),0),1)          AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),p.monto_total_pagos),0)             AS monto
      FROM facturalo_pagos p WITH (NOLOCK)
      WHERE p.UUID = @uuid
      ORDER BY p.fecha_pago ASC
    `),
    db.request().input("uuid", sql.NVarChar, uuid).query(`
      SELECT TOP (80)
        ISNULL(d.uuid_doc_relacionado,'')                                     AS uuidRelacionado,
        ISNULL(TRY_CONVERT(decimal(18,2),d.imp_saldo_ant),0)                  AS saldoAnterior,
        ISNULL(TRY_CONVERT(decimal(18,2),d.imp_pagado),0)                     AS impPagado,
        ISNULL(TRY_CONVERT(decimal(18,2),d.imp_saldo_insoluto),0)             AS saldoInsoluto,
        ISNULL(TRY_CONVERT(decimal(18,2),d.base),0)                           AS base,
        ISNULL(TRY_CONVERT(decimal(18,2),d.impuesto),0)                       AS impuesto
      FROM facturalo_pagos p WITH (NOLOCK)
      INNER JOIN facturalo_pago_doc_relacionado d WITH (NOLOCK) ON d.pago_id = p.id
      WHERE p.UUID = @uuid
    `),
  ]);

  return {
    header,
    conceptos: conceptosRes.recordset,
    pagos: pagosRes.recordset,
    docsRelacionados: docsRes.recordset,
  };
}

export interface ChatConciliacionPagosFilters {
  limit?: number;
  onlyWithDifferences?: boolean;
}

export async function chatConciliarPagosRelacionados(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatConciliacionPagosFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 300));

  const req = db.request();

  const res = await req
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .input("onlyDiff", sql.Bit, filters.onlyWithDifferences ? 1 : 0)
    .query(`
      WITH pagosBase AS (
        SELECT
          p.id                                                              AS pagoId,
          ISNULL(p.UUID,'')                                                 AS uuidPago,
          p.fecha_pago                                                      AS fechaPago,
          ISNULL(p.moneda,'MXN')                                            AS moneda,
          ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),p.tipoCambio),0),1)      AS tipoCambio,
          ISNULL(TRY_CONVERT(decimal(18,2),p.monto_total_pagos),0)         AS montoPago,
          ISNULL(fc.RFC_Emisor,'')                                          AS rfcEmisor,
          ISNULL(fc.RFC_Receptor,'')                                        AS rfcReceptor,
          ISNULL(fc.RazonSocialEmisor,'')                                   AS razonSocialEmisor,
          ISNULL(fc.RazonSocialReceptor,'')                                 AS razonSocialReceptor,
          CASE WHEN fc.RFC_Emisor = @rfc
               THEN 'INGRESO' ELSE 'EGRESO' END                            AS movimiento
        FROM facturalo_pagos p WITH (NOLOCK)
        INNER JOIN facturalo_cfdis fc WITH (NOLOCK) ON fc.UUID = p.UUID
        WHERE fc.TipoComprobante = 'P'
          AND (fc.RFC_Emisor = @rfc OR fc.RFC_Receptor = @rfc)
          AND fc.Fecha >= @dateFrom AND fc.Fecha < @dateTo
      ),
      docsAgg AS (
        SELECT
          d.pago_id                                                         AS pagoId,
          COUNT(1)                                                          AS docsRelacionados,
          COUNT(DISTINCT ISNULL(d.uuid_doc_relacionado,''))                 AS facturasRelacionadas,
          SUM(ISNULL(TRY_CONVERT(decimal(18,2),d.imp_pagado),0))           AS totalImpPagado,
          SUM(ISNULL(TRY_CONVERT(decimal(18,2),d.base),0))                 AS totalBase,
          SUM(ISNULL(TRY_CONVERT(decimal(18,2),d.impuesto),0))             AS totalImpuesto,
          SUM(ISNULL(TRY_CONVERT(decimal(18,2),d.imp_saldo_ant),0))        AS totalSaldoAnterior,
          SUM(ISNULL(TRY_CONVERT(decimal(18,2),d.imp_saldo_insoluto),0))   AS totalSaldoInsoluto
        FROM facturalo_pago_doc_relacionado d WITH (NOLOCK)
        INNER JOIN pagosBase pb ON pb.pagoId = d.pago_id
        GROUP BY d.pago_id
      )
      SELECT TOP (@limit)
        b.uuidPago,
        CONVERT(varchar(10), b.fechaPago, 23)                               AS fechaPago,
        b.movimiento,
        b.moneda,
        b.tipoCambio,
        b.montoPago,
        b.rfcEmisor,
        b.razonSocialEmisor,
        b.rfcReceptor,
        b.razonSocialReceptor,
        ISNULL(a.docsRelacionados, 0)                                       AS docsRelacionados,
        ISNULL(a.facturasRelacionadas, 0)                                   AS facturasRelacionadas,
        ISNULL(a.totalImpPagado, 0)                                         AS totalImpPagado,
        ISNULL(a.totalBase, 0)                                              AS totalBase,
        ISNULL(a.totalImpuesto, 0)                                          AS totalImpuesto,
        ISNULL(a.totalSaldoAnterior, 0)                                     AS totalSaldoAnterior,
        ISNULL(a.totalSaldoInsoluto, 0)                                     AS totalSaldoInsoluto,
        ISNULL(a.totalImpPagado, 0) - b.montoPago                           AS diferenciaImpPagadoVsMonto
      FROM pagosBase b
      LEFT JOIN docsAgg a ON a.pagoId = b.pagoId
      WHERE @onlyDiff = 0 OR ABS(ISNULL(a.totalImpPagado, 0) - b.montoPago) > 0.01
      ORDER BY b.fechaPago DESC, b.uuidPago DESC
    `);

  const rows = res.recordset;

  const resumen = rows.reduce(
    (acc, r) => {
      const montoPago = Number(r.montoPago) || 0;
      const impPagado = Number(r.totalImpPagado) || 0;
      const dif = Number(r.diferenciaImpPagadoVsMonto) || 0;
      acc.pagos += 1;
      acc.montoTotalPagos += montoPago;
      acc.totalImpPagado += impPagado;
      acc.diferenciaNeta += dif;
      acc.diferenciaAbsoluta += Math.abs(dif);
      if (Math.abs(dif) > 0.01) acc.pagosConDiferencia += 1;
      return acc;
    },
    {
      pagos: 0,
      pagosConDiferencia: 0,
      montoTotalPagos: 0,
      totalImpPagado: 0,
      diferenciaNeta: 0,
      diferenciaAbsoluta: 0,
    },
  );

  return {
    limit,
    onlyWithDifferences: !!filters.onlyWithDifferences,
    resumen,
    rows,
  };
}

// ─── Chat: Conceptos Analysis (Suppliers, Expenses, Items) ──────────────────
export interface ChatConceptosAnalysisFilters {
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS";
  tipoComprobante?: "I" | "E" | "N" | "P";
  groupBy?: "none" | "clave" | "supplier" | "descripcion";
  limit?: number;
}

export async function chatGetConceptosAnalysis(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatConceptosAnalysisFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const groupBy = filters.groupBy ?? "clave";
  const movimiento = filters.movimiento ?? "AMBOS";

  const req = db.request();

  const res = await req
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .input("movimiento", sql.NVarChar, movimiento)
    .input("tipo", sql.NVarChar, filters.tipoComprobante ?? null)
    .input("groupBy", sql.NVarChar, groupBy)
    .query(`
      WITH conceptosBase AS (
        SELECT
          ISNULL(c.ClaveProductoServicio, '') AS clave,
          ISNULL(c.Descripcion, '') AS descripcion,
          ISNULL(f.RazonSocialEmisor, '') AS razonSocialEmisor,
          ISNULL(f.RazonSocialReceptor, '') AS razonSocialReceptor,
          CASE WHEN f.RFC_Emisor = @rfc
               THEN 'INGRESO' ELSE 'EGRESO' END AS movimiento,
          c.UUID,
          ISNULL(TRY_CONVERT(decimal(18,4), c.Cantidad), 0) AS cantidad,
          ISNULL(TRY_CONVERT(decimal(18,2), c.Importe), 0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6), f.tipoCambio), 0), 1) AS importe
        FROM facturalo_conceptos c WITH (NOLOCK)
        INNER JOIN facturalo_cfdis f WITH (NOLOCK) ON f.UUID = c.UUID
        WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
          AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
          AND f.TipoComprobante IN ('I','E','N','P')
          AND (
            @movimiento = 'AMBOS' OR
            (@movimiento = 'INGRESO' AND f.RFC_Emisor = @rfc) OR
            (@movimiento = 'EGRESO' AND f.RFC_Receptor = @rfc AND f.RFC_Emisor <> @rfc)
          )
          AND (@tipo IS NULL OR f.TipoComprobante = @tipo)
      )
      SELECT TOP (@limit)
        CASE
          WHEN @groupBy = 'clave' THEN clave
          WHEN @groupBy = 'supplier' THEN CASE WHEN movimiento = 'INGRESO' THEN razonSocialReceptor ELSE razonSocialEmisor END
          ELSE ISNULL(descripcion, clave)
        END AS groupKey,
        COUNT(DISTINCT UUID) AS cfdis,
        COUNT(1) AS conceptos,
        SUM(cantidad) AS cantidadTotal,
        SUM(importe) AS importeTotal
      FROM conceptosBase
      GROUP BY CASE
        WHEN @groupBy = 'clave' THEN clave
        WHEN @groupBy = 'supplier' THEN CASE WHEN movimiento = 'INGRESO' THEN razonSocialReceptor ELSE razonSocialEmisor END
        ELSE ISNULL(descripcion, clave)
      END
      ORDER BY SUM(importe) DESC
    `);

  return {
    limit,
    groupBy,
    movimiento,
    count: res.recordset.length,
    rows: res.recordset,
  };
}

// ─── Chat: Resumen Fiscal General ────────────────────────────────────────────

export async function chatGetResumenFiscal(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
) {
  const db = await getDbLong();
  const TC = `ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)`;

  const res = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .query(`
      SELECT
        COUNT(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN 1 END) AS ingresosCount,
        ISNULL(SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(Subtotal,0)*${TC} END),0) AS ingresosSubtotal,
        ISNULL(SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladado,0)*${TC} END),0) AS ingresosIVA,
        ISNULL(SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoISR,0)*${TC} END),0) AS ingresosRetISR,
        ISNULL(SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoIVA,0)*${TC} END),0) AS ingresosRetIVA,
        ISNULL(SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(Total,0)*${TC} END),0) AS ingresosTotal,

        COUNT(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN 1 END) AS egresosCount,
        ISNULL(SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(Subtotal,0)*${TC} END),0) AS egresosSubtotal,
        ISNULL(SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladado,0)*${TC} END),0) AS egresosIVA,
        ISNULL(SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoISR,0)*${TC} END),0) AS egresosRetISR,
        ISNULL(SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoIVA,0)*${TC} END),0) AS egresosRetIVA,
        ISNULL(SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(Total,0)*${TC} END),0) AS egresosTotal,

        COUNT(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N' AND UPPER(Status)='VIGENTE' THEN 1 END) AS nominaCount,
        ISNULL(SUM(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N' AND UPPER(Status)='VIGENTE' THEN ISNULL(Subtotal,0)*${TC} END),0) AS nominaSubtotal,
        ISNULL(SUM(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoISR,0)*${TC} END),0) AS nominaRetISR,
        ISNULL(SUM(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N' AND UPPER(Status)='VIGENTE' THEN ISNULL(Total,0)*${TC} END),0) AS nominaTotal,

        COUNT(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='E' AND UPPER(Status)='VIGENTE' THEN 1 END) AS notasCreditoCount,
        ISNULL(SUM(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='E' AND UPPER(Status)='VIGENTE' THEN ISNULL(Total,0)*${TC} END),0) AS notasCreditoTotal,

        COUNT(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='P' AND UPPER(Status)='VIGENTE' THEN 1 END) AS complementosPagoCount,

        COUNT(CASE WHEN (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND UPPER(Status)<>'VIGENTE' THEN 1 END) AS canceladasCount
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND Fecha>=@dateFrom AND Fecha<@dateTo
    `);

  const row = res.recordset[0] ?? {};
  return {
    periodo: { desde: dateFrom.toISOString().slice(0, 10), hasta: dateTo.toISOString().slice(0, 10) },
    ingresos: {
      facturas: row.ingresosCount ?? 0,
      subtotal: row.ingresosSubtotal ?? 0,
      iva: row.ingresosIVA ?? 0,
      retISR: row.ingresosRetISR ?? 0,
      retIVA: row.ingresosRetIVA ?? 0,
      total: row.ingresosTotal ?? 0,
    },
    egresos: {
      facturas: row.egresosCount ?? 0,
      subtotal: row.egresosSubtotal ?? 0,
      iva: row.egresosIVA ?? 0,
      retISR: row.egresosRetISR ?? 0,
      retIVA: row.egresosRetIVA ?? 0,
      total: row.egresosTotal ?? 0,
    },
    nomina: {
      cfdi: row.nominaCount ?? 0,
      subtotal: row.nominaSubtotal ?? 0,
      retISR: row.nominaRetISR ?? 0,
      total: row.nominaTotal ?? 0,
    },
    notasCredito: {
      cfdi: row.notasCreditoCount ?? 0,
      total: row.notasCreditoTotal ?? 0,
    },
    complementosPago: { cfdi: row.complementosPagoCount ?? 0 },
    canceladas: { cfdi: row.canceladasCount ?? 0 },
  };
}

// ─── Chat: Desglose de IVA por tasa ──────────────────────────────────────────

export async function chatGetIvaDesglose(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS",
) {
  const db = await getDbLong();
  const mov = movimiento ?? "AMBOS";
  const TC = `ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)`;

  const res = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("movimiento", sql.NVarChar, mov)
    .query(`
      SELECT
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA16,0)*${TC} ELSE 0 END) AS ingresosBase16,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladadoIVADieciseis,0)*${TC} ELSE 0 END) AS ingresosIVA16,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA8,0)*${TC} ELSE 0 END) AS ingresosBase8,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladadoIVAOcho,0)*${TC} ELSE 0 END) AS ingresosIVA8,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA0,0)*${TC} ELSE 0 END) AS ingresosBase0,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVAExento,0)*${TC} ELSE 0 END) AS ingresosBaseExento,
        SUM(CASE WHEN RFC_Emisor=@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='INGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoIVA,0)*${TC} ELSE 0 END) AS ingresosRetIVA,

        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA16,0)*${TC} ELSE 0 END) AS egresosBase16,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladadoIVADieciseis,0)*${TC} ELSE 0 END) AS egresosIVA16,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA8,0)*${TC} ELSE 0 END) AS egresosBase8,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalTrasladadoIVAOcho,0)*${TC} ELSE 0 END) AS egresosIVA8,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVA0,0)*${TC} ELSE 0 END) AS egresosBase0,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(BaseIVAExento,0)*${TC} ELSE 0 END) AS egresosBaseExento,
        SUM(CASE WHEN RFC_Receptor=@rfc AND RFC_Emisor<>@rfc AND TipoComprobante='I' AND UPPER(Movimiento)='EGRESO' AND UPPER(Status)='VIGENTE' THEN ISNULL(TotalRetenidoIVA,0)*${TC} ELSE 0 END) AS egresosRetIVA
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND Fecha>=@dateFrom AND Fecha<@dateTo
        AND TipoComprobante='I'
    `);

  const r = res.recordset[0] ?? {};
  return {
    ingresos: {
      tasa16: { base: r.ingresosBase16 ?? 0, iva: r.ingresosIVA16 ?? 0 },
      tasa8:  { base: r.ingresosBase8 ?? 0, iva: r.ingresosIVA8 ?? 0 },
      tasa0:  { base: r.ingresosBase0 ?? 0 },
      exento: { base: r.ingresosBaseExento ?? 0 },
      retenidoIVA: r.ingresosRetIVA ?? 0,
      ivaNetoPagar: (r.ingresosIVA16 ?? 0) + (r.ingresosIVA8 ?? 0) - (r.ingresosRetIVA ?? 0),
    },
    egresos: {
      tasa16: { base: r.egresosBase16 ?? 0, iva: r.egresosIVA16 ?? 0 },
      tasa8:  { base: r.egresosBase8 ?? 0, iva: r.egresosIVA8 ?? 0 },
      tasa0:  { base: r.egresosBase0 ?? 0 },
      exento: { base: r.egresosBaseExento ?? 0 },
      retenidoIVA: r.egresosRetIVA ?? 0,
      ivaAcreditar: (r.egresosIVA16 ?? 0) + (r.egresosIVA8 ?? 0),
    },
    ivaNeto: {
      descripcion: "IVA de ingresos menos IVA acreditable de egresos",
      resultado: ((r.ingresosIVA16 ?? 0) + (r.ingresosIVA8 ?? 0)) - ((r.egresosIVA16 ?? 0) + (r.egresosIVA8 ?? 0)),
    },
  };
}

// ─── Chat: Nómina ─────────────────────────────────────────────────────────────

export interface ChatNominaFilters {
  direccion?: "EMITIDA" | "RECIBIDA" | "AMBAS";
  limit?: number;
}

export async function chatGetNomina(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatNominaFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const dir = filters.direccion ?? "AMBAS";
  const TC = `ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)`;

  const res = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        CASE WHEN RFC_Emisor=@rfc THEN 'EMITIDA' ELSE 'RECIBIDA' END AS direccion,
        ISNULL(NULLIF(CASE WHEN RFC_Emisor=@rfc THEN RazonSocialReceptor ELSE RazonSocialEmisor END,''),
               CASE WHEN RFC_Emisor=@rfc THEN RFC_Receptor ELSE RFC_Emisor END) AS contraparte,
        CASE WHEN RFC_Emisor=@rfc THEN RFC_Receptor ELSE RFC_Emisor END AS rfcContraparte,
        COUNT(*) AS cfdi,
        ISNULL(SUM(ISNULL(Subtotal,0)*${TC}),0) AS subtotal,
        ISNULL(SUM(ISNULL(TotalRetenidoISR,0)*${TC}),0) AS retISR,
        ISNULL(SUM(ISNULL(TotalRetenidoIVA,0)*${TC}),0) AS retIVA,
        ISNULL(SUM(ISNULL(Total,0)*${TC}),0) AS total
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND TipoComprobante='N'
        AND UPPER(Status)='VIGENTE'
        AND Fecha>=@dateFrom AND Fecha<@dateTo
        AND (
          '${dir}' = 'AMBAS' OR
          ('${dir}' = 'EMITIDA' AND RFC_Emisor=@rfc) OR
          ('${dir}' = 'RECIBIDA' AND RFC_Receptor=@rfc)
        )
      GROUP BY
        CASE WHEN RFC_Emisor=@rfc THEN 'EMITIDA' ELSE 'RECIBIDA' END,
        CASE WHEN RFC_Emisor=@rfc THEN RazonSocialReceptor ELSE RazonSocialEmisor END,
        CASE WHEN RFC_Emisor=@rfc THEN RFC_Receptor ELSE RFC_Emisor END
      ORDER BY total DESC
    `);

  const rows = res.recordset;
  const totalSubtotal = rows.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
  const totalRetISR   = rows.reduce((s, r) => s + (Number(r.retISR) || 0), 0);
  const totalTotal    = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return {
    direccion: dir,
    resumen: { subtotal: totalSubtotal, retISR: totalRetISR, total: totalTotal },
    count: rows.length,
    rows,
  };
}

// ─── Chat: Flujo Efectivo (Complementos P + Facturas PUE) ────────────────────

export interface ChatFlujoEfectivoFilters {
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS";
  groupBy?: "none" | "mes" | "formaPago";
  limit?: number;
}

export async function chatGetFlujoEfectivo(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatFlujoEfectivoFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 300));
  const mov = filters.movimiento ?? "AMBOS";
  const groupBy = filters.groupBy ?? "none";

  const res = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .query(`
      WITH flujo AS (
        -- Complementos de pago vigentes
        SELECT
          CASE WHEN fc.RFC_Emisor=@rfc THEN 'INGRESO' ELSE 'EGRESO' END AS movimiento,
          'Complemento P' AS fuente,
          CONVERT(varchar(7), p.fecha_pago, 120) AS mes,
          ISNULL(p.forma_pago,'') AS formaPago,
          ISNULL(TRY_CONVERT(decimal(18,2), p.monto_total_pagos), 0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),p.tipoCambio),0),1) AS monto
        FROM dbo.facturalo_cfdis fc WITH (NOLOCK)
        INNER JOIN dbo.facturalo_pagos p WITH (NOLOCK) ON p.UUID = fc.UUID
        WHERE (fc.RFC_Emisor=@rfc OR fc.RFC_Receptor=@rfc)
          AND fc.TipoComprobante='P'
          AND fc.Status='Vigente'
          AND p.fecha_pago>=@dateFrom AND p.fecha_pago<@dateTo

        UNION ALL

        -- Facturas PUE (pago en una sola exhibición)
        SELECT
          CASE WHEN RFC_Emisor=@rfc THEN 'INGRESO' ELSE 'EGRESO' END AS movimiento,
          'Factura PUE' AS fuente,
          CONVERT(varchar(7), Fecha, 120) AS mes,
          ISNULL(TipoPago,'') AS formaPago,
          ISNULL(TRY_CONVERT(decimal(18,2),Total),0)
            * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1) AS monto
        FROM dbo.facturalo_cfdis WITH (NOLOCK)
        WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
          AND TipoComprobante='I'
          AND MetodoPago='PUE'
          AND Status='Vigente'
          AND Fecha>=@dateFrom AND Fecha<@dateTo
      )
      SELECT TOP (@limit)
        CASE
          WHEN '${groupBy}'='mes' THEN mes
          WHEN '${groupBy}'='formaPago' THEN formaPago
          ELSE 'TOTAL'
        END AS groupKey,
        movimiento,
        COUNT(*) AS operaciones,
        SUM(monto) AS monto
      FROM flujo
      WHERE '${mov}'='AMBOS' OR movimiento='${mov}'
      GROUP BY
        movimiento,
        CASE
          WHEN '${groupBy}'='mes' THEN mes
          WHEN '${groupBy}'='formaPago' THEN formaPago
          ELSE 'TOTAL'
        END
      ORDER BY SUM(monto) DESC
    `);

  const rows = res.recordset;
  const ingreso = rows.filter(r => r.movimiento === 'INGRESO').reduce((s, r) => s + (Number(r.monto) || 0), 0);
  const egreso  = rows.filter(r => r.movimiento === 'EGRESO').reduce((s, r) => s + (Number(r.monto) || 0), 0);

  return {
    movimiento: mov,
    groupBy,
    resumen: { ingreso, egreso, neto: ingreso - egreso },
    count: rows.length,
    rows,
  };
}

// ─── Chat: Facturas Canceladas ────────────────────────────────────────────────

export interface ChatCanceladasFilters {
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS";
  limit?: number;
}

export async function chatGetFacturasCanceladas(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatCanceladasFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const mov = filters.movimiento ?? "AMBOS";
  const TC = `ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),tipoCambio),0),1)`;

  const res = await db.request()
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        ISNULL(UUID,'') AS uuid,
        Fecha AS fecha,
        ISNULL(TipoComprobante,'') AS tipoComprobante,
        CASE WHEN RFC_Emisor=@rfc THEN 'INGRESO' ELSE 'EGRESO' END AS movimiento,
        ISNULL(Status,'') AS status,
        ISNULL(RFC_Emisor,'') AS rfcEmisor,
        ISNULL(RazonSocialEmisor,'') AS razonSocialEmisor,
        ISNULL(RFC_Receptor,'') AS rfcReceptor,
        ISNULL(RazonSocialReceptor,'') AS razonSocialReceptor,
        ISNULL(TRY_CONVERT(decimal(18,2),Total),0)*${TC} AS total
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND UPPER(Status)<>'VIGENTE'
        AND Fecha>=@dateFrom AND Fecha<@dateTo
        AND TipoComprobante IN ('I','E','N','P')
        AND (
          '${mov}'='AMBOS' OR
          ('${mov}'='INGRESO' AND RFC_Emisor=@rfc) OR
          ('${mov}'='EGRESO' AND RFC_Receptor=@rfc AND RFC_Emisor<>@rfc)
        )
      ORDER BY Fecha DESC
    `);

  const rows = res.recordset;
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    const s = String(r.status);
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  return {
    movimiento: mov,
    totalCanceladas: rows.length,
    porStatus: byStatus,
    montoTotal: rows.reduce((s, r) => s + (Number(r.total) || 0), 0),
    rows,
  };
}

// ─── Chat: Top Facturas by Importe (Individual Invoices) ───────────────────
export interface ChatTopFacturasFilters {
  movimiento?: "INGRESO" | "EGRESO" | "AMBOS";
  tipoComprobante?: "I" | "E" | "N" | "P";
  limit?: number;
}

export async function chatGetTopFacturas(
  rfc: string,
  dateFrom: Date,
  dateTo: Date,
  filters: ChatTopFacturasFilters = {},
) {
  const db = await getDbLong();
  const limit = Math.max(1, Math.min(filters.limit ?? 20, 200));
  const movimiento = filters.movimiento ?? "AMBOS";

  const req = db.request();

  const res = await req
    .input("rfc", sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime, dateFrom)
    .input("dateTo", sql.DateTime, dateTo)
    .input("limit", sql.Int, limit)
    .input("movimiento", sql.NVarChar, movimiento)
    .input("tipo", sql.NVarChar, filters.tipoComprobante ?? null)
    .query(`
      SELECT TOP (@limit)
        ISNULL(f.UUID,'')                                                     AS uuid,
        f.Fecha                                                               AS fecha,
        ISNULL(f.TipoComprobante,'')                                          AS tipoComprobante,
        CASE WHEN f.RFC_Emisor = @rfc
             THEN 'INGRESO' ELSE 'EGRESO' END                                 AS movimiento,
        ISNULL(f.Status,'')                                                   AS status,
        ISNULL(f.RFC_Emisor,'')                                               AS rfcEmisor,
        ISNULL(f.RazonSocialEmisor,'')                                        AS razonSocialEmisor,
        ISNULL(f.RFC_Receptor,'')                                             AS rfcReceptor,
        ISNULL(f.RazonSocialReceptor,'')                                      AS razonSocialReceptor,
        ISNULL(f.MetodoPago,'')                                               AS metodoPago,
        ISNULL(f.TipoPago,'')                                                 AS formaPago,
        ISNULL(f.Moneda,'MXN')                                                AS moneda,
        ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)          AS tipoCambio,
        ISNULL(TRY_CONVERT(decimal(18,2),f.Subtotal),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS subtotal,
        ISNULL(TRY_CONVERT(decimal(18,2),f.TotalTrasladado),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS iva,
        ISNULL(TRY_CONVERT(decimal(18,2),f.Total),0)
          * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)      AS total
      FROM facturalo_cfdis f WITH (NOLOCK)
      WHERE (f.RFC_Emisor = @rfc OR f.RFC_Receptor = @rfc)
        AND f.Fecha >= @dateFrom AND f.Fecha < @dateTo
        AND f.TipoComprobante IN ('I','E','N','P')
        AND (
          @movimiento = 'AMBOS' OR
          (@movimiento = 'INGRESO' AND f.RFC_Emisor = @rfc) OR
          (@movimiento = 'EGRESO' AND f.RFC_Receptor = @rfc AND f.RFC_Emisor <> @rfc)
        )
        AND (@tipo IS NULL OR f.TipoComprobante = @tipo)
      ORDER BY (ISNULL(TRY_CONVERT(decimal(18,2),f.Total),0) 
                * ISNULL(NULLIF(TRY_CONVERT(decimal(18,6),f.tipoCambio),0),1)) DESC
    `);

  return {
    limit,
    movimiento,
    count: res.recordset.length,
    rows: res.recordset,
  };
}
