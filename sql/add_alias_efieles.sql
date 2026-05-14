-- ============================================================
-- AIcuenta · Agregar nombre comercial (alias) a EFIELES
-- Azure SQL Database
-- ============================================================

ALTER TABLE EFIELES
  ADD alias NVARCHAR(120) NULL;
