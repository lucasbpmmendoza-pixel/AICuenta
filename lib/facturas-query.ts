import sql from "mssql";
import { getDb } from "@/lib/db";

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

  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.DateTime,  dateFrom)
    .input("dateTo",   sql.DateTime,  dateTo)
    .query(`
      -- RS0: Ingresos (facturas emitidas, tipo I)
      SELECT
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
      ORDER BY Fecha DESC;

      -- RS1: Egresos agrupados por RFC emisor
      SELECT
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
      ORDER BY Total_MXN DESC;

      -- RS2: Nómina (tipo N emitida o recibida)
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
        CASE WHEN RFC_Emisor=@rfc THEN 'Nómina Egreso' ELSE 'Nómina Ingreso' END AS TipoNomina
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc) AND TipoComprobante='N'
        AND Fecha>=@dateFrom AND Fecha<@dateTo
      ORDER BY Fecha DESC;

      -- RS3: Retenciones (facturas con cualquier retención > 0)
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
        CASE WHEN RFC_Emisor=@rfc THEN 'Emitida' ELSE 'Recibida' END AS Direccion
      FROM facturalo_cfdis WITH (NOLOCK)
      WHERE (RFC_Emisor=@rfc OR RFC_Receptor=@rfc)
        AND (ISNULL(TotalRetenidoISR,0)>0 OR ISNULL(TotalRetenidoIVA,0)>0 OR ISNULL(TotalRetenidoIEPS,0)>0)
        AND Fecha>=@dateFrom AND Fecha<@dateTo
      ORDER BY Fecha DESC;
    `);

  const rs = result.recordsets as unknown as Record<string, unknown>[][];
  return {
    ingresos:    (rs[0] ?? []) as unknown as IngresoCFDI[],
    egresos:     (rs[1] ?? []) as unknown as EgresoCFDI[],
    nomina:      (rs[2] ?? []) as unknown as NominaCFDI[],
    retenciones: (rs[3] ?? []) as unknown as RetencionCFDI[],
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
  year: number,
  month: number
): Promise<NotaCreditoRow[]> {
  const db = await getDb();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dateFrom = `${year}-${pad2(month)}-01`;
  const lastDay  = new Date(year, month, 0).getDate();
  const dateTo   = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.VarChar,  dateFrom)
    .input("dateTo",   sql.VarChar,  dateTo)
    .query<NotaCreditoRow>(`
      SELECT
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
        AND CAST(fact.Fecha AS date) >= CAST(@dateFrom AS date)
        AND CAST(fact.Fecha AS date) <= CAST(@dateTo   AS date)
      ORDER BY fact.Fecha
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
  year: number,
  month: number
): Promise<PagoRow[]> {
  const db = await getDb();
  const dateFrom = `${year}-${pad2(month)}-01`;
  const lastDay  = new Date(year, month, 0).getDate();
  const dateTo   = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const result = await db
    .request()
    .input("rfc",      sql.NVarChar, rfc)
    .input("dateFrom", sql.VarChar,  dateFrom)
    .input("dateTo",   sql.VarChar,  dateTo)
    .query<PagoRow>(`
      SELECT
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
          AND fecha >= CONVERT(date, @dateFrom, 23)
          AND fecha <= CONVERT(date, @dateTo,   23)
      ) fc ON fc.UUID = p.UUID
      WHERE (fc.RFC_emisor = @rfc OR fc.RFC_receptor = @rfc)
        AND p.fecha_pago >= CONVERT(date, @dateFrom, 23)
        AND p.fecha_pago <= CONVERT(date, @dateTo,   23)
      ORDER BY p.fecha_pago, d.numParcialidad
    `);
  return result.recordset;
}
