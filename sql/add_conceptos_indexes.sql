-- ─────────────────────────────────────────────────────────────────────────────
-- Índices para estados-financieros / fetchEstadosFinancieros
-- Ejecutar en Azure SQL: mmendoza-database
-- ─────────────────────────────────────────────────────────────────────────────

-- ① Ingresos (conceptos emitidos por el RFC)
--   Query: WHERE rfc_cliente=@rfc AND movimiento='Ingreso'
--          AND fecha >= @dateFrom AND fecha < @dateTo
--   INCLUDE cubre todas las columnas del SELECT → covering index, sin key lookup
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_conceptos')
    AND name = 'IX_conceptos_rfc_mov_fecha'
)
CREATE INDEX IX_conceptos_rfc_mov_fecha
  ON dbo.facturalo_conceptos (rfc_cliente, movimiento, fecha)
  INCLUDE (Descripcion, ClaveProductoServicio, Cantidad, Importe, UUID)
  WITH (ONLINE = ON);

-- ② Egresos — la subquery en facturalo_cfdis
--   Subquery: WHERE RFC_Receptor=@rfc AND TipoComprobante='I'
--             AND Status='Vigente' AND Fecha >= @dateFrom AND Fecha < @dateTo
--   INCLUDE UUID = covering, evita key lookup para generar la lista de UUIDs
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_cfdis')
    AND name = 'IX_cfdis_receptor_tipo_status_fecha'
)
CREATE INDEX IX_cfdis_receptor_tipo_status_fecha
  ON dbo.facturalo_cfdis (RFC_Receptor, TipoComprobante, Status, Fecha)
  INCLUDE (UUID)
  WITH (ONLINE = ON);

-- ③ Egresos — join/IN en facturalo_conceptos por UUID
--   Query: WHERE UUID IN (lista de UUIDs del paso anterior)
--   Si UUID es PK o unique, este índice puede ya existir; verificar primero.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_conceptos')
    AND name = 'IX_conceptos_uuid'
)
CREATE INDEX IX_conceptos_uuid
  ON dbo.facturalo_conceptos (UUID)
  INCLUDE (Descripcion, ClaveProductoServicio, Cantidad, Importe)
  WITH (ONLINE = ON);

-- ④ Ingresos emitidos en facturalo_cfdis  (lo usan otras queries del módulo)
--   WHERE RFC_Emisor=@rfc AND TipoComprobante='I'/'N'
--          AND Fecha >= @dateFrom AND Fecha < @dateTo
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_cfdis')
    AND name = 'IX_cfdis_emisor_tipo_fecha'
)
CREATE INDEX IX_cfdis_emisor_tipo_fecha
  ON dbo.facturalo_cfdis (RFC_Emisor, TipoComprobante, Fecha)
  INCLUDE (UUID, Status, Total, TipoComprobante)
  WITH (ONLINE = ON);
