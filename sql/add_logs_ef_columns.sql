-- ============================================================
-- AIcuenta · Migración: agregar contadores de Estados Financieros a logs
-- Azure SQL Database (SQL Server)
-- Ejecutar una sola vez
--
-- Botones nuevos rastreados en la vista Estados Financieros:
--   btn_benchmark_estados_financieros        -> botón "Comparar"
--   btn_audit_conceptos_estados_financieros  -> botón "Auditar"
-- (btn_descargar_estados_financieros ya existía)
--
-- Se usa NOT NULL DEFAULT 0 para que las filas ya existentes queden
-- en 0 y el UPDATE "col = col + 1" funcione (col + 1 sobre NULL daría NULL).
-- ============================================================

ALTER TABLE logs
  ADD btn_benchmark_estados_financieros INT NOT NULL DEFAULT 0,
      btn_audit_conceptos_estados_financieros INT NOT NULL DEFAULT 0;
