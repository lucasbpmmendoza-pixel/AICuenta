-- ============================================================
-- AIcuenta · Migración: agregar columna account_type a users
-- ============================================================

ALTER TABLE users
ADD account_type NVARCHAR(10) NULL;
-- Valores posibles: 'multi' | 'single' | NULL (aún no configurado)
-- 'multi'  → Contador independiente / despacho (maneja varios RFCs)
-- 'single' → Negocio propio (maneja solo su RFC)
