-- ============================================================
-- AIcuenta · Migración: agregar downloads_enabled a EFIELES
-- Azure SQL Database
-- Ejecutar una sola vez
-- ============================================================

ALTER TABLE EFIELES
  ADD downloads_enabled BIT NOT NULL DEFAULT 1;
