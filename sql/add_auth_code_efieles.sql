-- Agrega columna auth_code a la tabla EFIELES
-- Se genera automaticamente al insertar un nuevo registro

ALTER TABLE EFIELES
  ADD auth_code NVARCHAR(12) NULL;

-- Rellenar registros existentes con un codigo unico
UPDATE EFIELES
SET auth_code = LEFT(REPLACE(CONVERT(NVARCHAR(36), NEWID()), '-', ''), 12)
WHERE auth_code IS NULL;

-- Ahora hacerla NOT NULL con default para futuros inserts
ALTER TABLE EFIELES
  ALTER COLUMN auth_code NVARCHAR(12) NOT NULL;

ALTER TABLE EFIELES
  ADD CONSTRAINT DF_efieles_auth_code DEFAULT LEFT(REPLACE(CONVERT(NVARCHAR(36), NEWID()), '-', ''), 12) FOR auth_code;

ALTER TABLE EFIELES
  ADD CONSTRAINT UQ_efieles_auth_code UNIQUE (auth_code);
