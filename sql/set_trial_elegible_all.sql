-- ============================================================
-- AIcuenta · Todos los clientes elegibles a 30 dias de prueba
-- ============================================================
-- Efecto: el checkout da 30 dias de prueba cuando users.trial_elegible = 1
-- (app/api/billing/checkout/route.ts). Este script:
--   1) deja el DEFAULT de la columna en 1  -> usuarios NUEVOS elegibles
--      (los INSERT de register / google / team no fijan la columna, usan el default)
--   2) pone trial_elegible = 1 a TODOS los usuarios existentes
-- Idempotente: se puede correr mas de una vez sin romper.

IF COL_LENGTH('dbo.users', 'trial_elegible') IS NULL
BEGIN
  -- Por si algun entorno no tuviera la columna todavia.
  ALTER TABLE dbo.users
    ADD trial_elegible BIT NOT NULL
    CONSTRAINT DF_users_trial_elegible DEFAULT 1;
END
ELSE
BEGIN
  -- Cambia el DEFAULT existente (sea cual sea su nombre) a 1.
  DECLARE @df sysname;
  SELECT @df = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c
    ON c.object_id = dc.parent_object_id
   AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.users')
    AND c.name = 'trial_elegible';

  IF @df IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT ' + @df);

  ALTER TABLE dbo.users
    ADD CONSTRAINT DF_users_trial_elegible DEFAULT 1 FOR trial_elegible;
END
GO

-- Todos los usuarios actuales: elegibles.
UPDATE dbo.users SET trial_elegible = 1 WHERE trial_elegible = 0;
GO
