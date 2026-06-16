-- ─────────────────────────────────────────────────────────────────────────────
-- Índices de rendimiento para EXPORT de facturas y DASHBOARD
-- Azure SQL · tabla dbo.facturalo_cfdis
--
-- Contexto: tras hacer SARGable la query de export (se quitaron los UPPER() y el
-- OR emisor/receptor se separó en UNION ALL), cada rama hace un index seek por su
-- rol de RFC en lugar de un table scan completo. Estos índices son los que habilitan
-- ese seek. Son idempotentes (IF NOT EXISTS) y se crean ONLINE para no bloquear.
--
-- Si los índices ya existen con menos columnas en INCLUDE, ver la nota al final
-- para "actualizarlos" (DROP + CREATE) y cubrir también Movimiento.
-- ─────────────────────────────────────────────────────────────────────────────

-- ① Rama EMISOR del export + queries del dashboard que filtran por RFC_Emisor.
--    Predicado: RFC_Emisor=@rfc AND Status='Vigente' AND Fecha>=.. AND Fecha<..
--               AND TipoComprobante IN ('I','N','E') AND Movimiento=..
--    Movimiento y Status en INCLUDE permiten descartar filas ANTES del key lookup.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_cfdis')
    AND name = 'IX_cfdis_emisor_tipo_fecha'
)
CREATE INDEX IX_cfdis_emisor_tipo_fecha
  ON dbo.facturalo_cfdis (RFC_Emisor, TipoComprobante, Fecha)
  INCLUDE (UUID, Status, Movimiento, Total)
  WITH (ONLINE = ON);

-- ② Rama RECEPTOR del export + queries del dashboard que filtran por RFC_Receptor.
--    Predicado: RFC_Receptor=@rfc AND Status='Vigente' AND Fecha range
--               AND TipoComprobante IN ('I','N','E') AND Movimiento=..
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.facturalo_cfdis')
    AND name = 'IX_cfdis_receptor_tipo_status_fecha'
)
CREATE INDEX IX_cfdis_receptor_tipo_status_fecha
  ON dbo.facturalo_cfdis (RFC_Receptor, TipoComprobante, Status, Fecha)
  INCLUDE (UUID, Movimiento, Total)
  WITH (ONLINE = ON);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA — actualizar índices ya existentes para incluir Movimiento
-- Si ① o ② ya existían (creados por sql/add_conceptos_indexes.sql) sin Movimiento
-- en INCLUDE, ejecuta esto UNA vez para que el seek filtre Movimiento sin key lookup:
--
--   DROP INDEX IX_cfdis_emisor_tipo_fecha          ON dbo.facturalo_cfdis;
--   DROP INDEX IX_cfdis_receptor_tipo_status_fecha ON dbo.facturalo_cfdis;
--   -- luego re-ejecuta este script
--
-- Verifica el uso real con el plan de ejecución (debe decir "Index Seek", no "Scan"):
--   SET STATISTICS IO, TIME ON;
--   -- (ejecutar la query del export con un RFC grande)
-- ─────────────────────────────────────────────────────────────────────────────
