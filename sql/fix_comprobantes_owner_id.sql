-- Fix: ampliar owner_id en Comprobantes para aceptar GUIDs completos
-- 1. Soltar el índice que depende de la columna
DROP INDEX IX_Comprobantes_owner_id ON dbo.Comprobantes;

-- 2. Ampliar la columna
ALTER TABLE dbo.Comprobantes
  ALTER COLUMN owner_id NVARCHAR(200) NOT NULL;

-- 3. Recrear el índice
CREATE INDEX IX_Comprobantes_owner_id ON dbo.Comprobantes (owner_id);
