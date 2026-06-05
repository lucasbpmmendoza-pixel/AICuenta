-- ============================================================
-- AIcuenta · Migracion: agregar columna plan_type a users
-- ============================================================

ALTER TABLE users
ADD plan_type NVARCHAR(30) NULL;
-- Valores permitidos:
-- basic          -> Incluye 1 RFC. Para cuenta single y cuenta multi.
-- business_pro   -> Solo multi. Hasta 5 RFCs y 5 miembros.
-- business_scale -> Solo multi. Hasta 20 RFCs y 20 miembros.

UPDATE users
SET plan_type = 'basic'
WHERE plan_type IS NULL;

ALTER TABLE users
ALTER COLUMN plan_type NVARCHAR(30) NOT NULL;

ALTER TABLE users
ADD CONSTRAINT CK_users_plan_type
CHECK (plan_type IN ('basic', 'business_pro', 'business_scale'));

ALTER TABLE users
ADD CONSTRAINT DF_users_plan_type DEFAULT 'basic' FOR plan_type;

CREATE INDEX IX_users_plan_type ON users (plan_type);
