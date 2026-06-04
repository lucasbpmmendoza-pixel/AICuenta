-- ============================================================
-- AIcuenta · Migracion Stripe para tablas existentes (SQL Server)
-- Uso: ejecutar cuando ya existen tablas y quieres agregar soporte de suscripciones
-- ============================================================

SET XACT_ABORT ON;
BEGIN TRAN;

-- ------------------------------------------------------------
-- 1) plans
-- ------------------------------------------------------------
IF OBJECT_ID('plans', 'U') IS NULL
BEGIN
  CREATE TABLE plans (
    id INT PRIMARY KEY IDENTITY(1,1),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    costo DECIMAL(10, 2) NOT NULL,
    duracion_meses INT NOT NULL CHECK (duracion_meses IN (1, 3, 6, 12)),
    stripe_product_id VARCHAR(255) NULL,
    stripe_price_id VARCHAR(255) NULL,
    descripcion NVARCHAR(MAX) NULL,
    es_activo BIT NOT NULL CONSTRAINT DF_plans_es_activo DEFAULT 1,
    fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_plans_fecha_creacion DEFAULT SYSUTCDATETIME(),
    fecha_actualizacion DATETIME2 NOT NULL CONSTRAINT DF_plans_fecha_actualizacion DEFAULT SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  IF COL_LENGTH('plans', 'stripe_product_id') IS NULL
    ALTER TABLE plans ADD stripe_product_id VARCHAR(255) NULL;

  IF COL_LENGTH('plans', 'stripe_price_id') IS NULL
    ALTER TABLE plans ADD stripe_price_id VARCHAR(255) NULL;

  IF COL_LENGTH('plans', 'descripcion') IS NULL
    ALTER TABLE plans ADD descripcion NVARCHAR(MAX) NULL;

  IF COL_LENGTH('plans', 'es_activo') IS NULL
  BEGIN
    ALTER TABLE plans ADD es_activo BIT NULL;
    UPDATE plans SET es_activo = 1 WHERE es_activo IS NULL;
    ALTER TABLE plans ALTER COLUMN es_activo BIT NOT NULL;
    IF OBJECT_ID('DF_plans_es_activo', 'D') IS NULL
      ALTER TABLE plans ADD CONSTRAINT DF_plans_es_activo DEFAULT 1 FOR es_activo;
  END

  IF COL_LENGTH('plans', 'fecha_creacion') IS NULL
  BEGIN
    ALTER TABLE plans ADD fecha_creacion DATETIME2 NULL;
    UPDATE plans SET fecha_creacion = SYSUTCDATETIME() WHERE fecha_creacion IS NULL;
    ALTER TABLE plans ALTER COLUMN fecha_creacion DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_plans_fecha_creacion', 'D') IS NULL
      ALTER TABLE plans ADD CONSTRAINT DF_plans_fecha_creacion DEFAULT SYSUTCDATETIME() FOR fecha_creacion;
  END

  IF COL_LENGTH('plans', 'fecha_actualizacion') IS NULL
  BEGIN
    ALTER TABLE plans ADD fecha_actualizacion DATETIME2 NULL;
    UPDATE plans SET fecha_actualizacion = SYSUTCDATETIME() WHERE fecha_actualizacion IS NULL;
    ALTER TABLE plans ALTER COLUMN fecha_actualizacion DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_plans_fecha_actualizacion', 'D') IS NULL
      ALTER TABLE plans ADD CONSTRAINT DF_plans_fecha_actualizacion DEFAULT SYSUTCDATETIME() FOR fecha_actualizacion;
  END
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_plans_stripe_product_id' AND object_id = OBJECT_ID('plans'))
  CREATE UNIQUE INDEX UX_plans_stripe_product_id ON plans(stripe_product_id) WHERE stripe_product_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_plans_stripe_price_id' AND object_id = OBJECT_ID('plans'))
  CREATE UNIQUE INDEX UX_plans_stripe_price_id ON plans(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) membresias
-- ------------------------------------------------------------
IF OBJECT_ID('membresias', 'U') IS NULL
BEGIN
  CREATE TABLE membresias (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id UNIQUEIDENTIFIER NOT NULL,
    plan_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) NULL,
    stripe_customer_id VARCHAR(255) NULL,
    fecha_inicio DATETIME2 NOT NULL CONSTRAINT DF_membresias_fecha_inicio DEFAULT SYSUTCDATETIME(),
    fecha_expiracion DATETIME2 NOT NULL,
    estado VARCHAR(20) NOT NULL CONSTRAINT DF_membresias_estado DEFAULT 'activa',
    renovacion_automatica BIT NOT NULL CONSTRAINT DF_membresias_renovacion DEFAULT 1,
    fecha_pago DATETIME2 NULL,
    fecha_cancelacion DATETIME2 NULL,
    razon_cancelacion NVARCHAR(MAX) NULL,
    fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_membresias_fecha_creacion DEFAULT SYSUTCDATETIME(),
    fecha_actualizacion DATETIME2 NOT NULL CONSTRAINT DF_membresias_fecha_actualizacion DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_membresias_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
    CONSTRAINT FK_membresias_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
    CONSTRAINT CK_membresias_estado CHECK (estado IN ('activa', 'expirada', 'cancelada', 'suspendida'))
  );
END
ELSE
BEGIN
  IF COL_LENGTH('membresias', 'stripe_subscription_id') IS NULL
    ALTER TABLE membresias ADD stripe_subscription_id VARCHAR(255) NULL;

  IF COL_LENGTH('membresias', 'stripe_customer_id') IS NULL
    ALTER TABLE membresias ADD stripe_customer_id VARCHAR(255) NULL;

  IF COL_LENGTH('membresias', 'fecha_inicio') IS NULL
  BEGIN
    ALTER TABLE membresias ADD fecha_inicio DATETIME2 NULL;
    UPDATE membresias SET fecha_inicio = SYSUTCDATETIME() WHERE fecha_inicio IS NULL;
    ALTER TABLE membresias ALTER COLUMN fecha_inicio DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_membresias_fecha_inicio', 'D') IS NULL
      ALTER TABLE membresias ADD CONSTRAINT DF_membresias_fecha_inicio DEFAULT SYSUTCDATETIME() FOR fecha_inicio;
  END

  IF COL_LENGTH('membresias', 'estado') IS NULL
  BEGIN
    ALTER TABLE membresias ADD estado VARCHAR(20) NULL;
    UPDATE membresias SET estado = 'activa' WHERE estado IS NULL;
    ALTER TABLE membresias ALTER COLUMN estado VARCHAR(20) NOT NULL;
    IF OBJECT_ID('DF_membresias_estado', 'D') IS NULL
      ALTER TABLE membresias ADD CONSTRAINT DF_membresias_estado DEFAULT 'activa' FOR estado;
  END

  IF COL_LENGTH('membresias', 'renovacion_automatica') IS NULL
  BEGIN
    ALTER TABLE membresias ADD renovacion_automatica BIT NULL;
    UPDATE membresias SET renovacion_automatica = 1 WHERE renovacion_automatica IS NULL;
    ALTER TABLE membresias ALTER COLUMN renovacion_automatica BIT NOT NULL;
    IF OBJECT_ID('DF_membresias_renovacion', 'D') IS NULL
      ALTER TABLE membresias ADD CONSTRAINT DF_membresias_renovacion DEFAULT 1 FOR renovacion_automatica;
  END

  IF COL_LENGTH('membresias', 'fecha_pago') IS NULL
    ALTER TABLE membresias ADD fecha_pago DATETIME2 NULL;

  IF COL_LENGTH('membresias', 'fecha_cancelacion') IS NULL
    ALTER TABLE membresias ADD fecha_cancelacion DATETIME2 NULL;

  IF COL_LENGTH('membresias', 'razon_cancelacion') IS NULL
    ALTER TABLE membresias ADD razon_cancelacion NVARCHAR(MAX) NULL;

  IF COL_LENGTH('membresias', 'fecha_creacion') IS NULL
  BEGIN
    ALTER TABLE membresias ADD fecha_creacion DATETIME2 NULL;
    UPDATE membresias SET fecha_creacion = SYSUTCDATETIME() WHERE fecha_creacion IS NULL;
    ALTER TABLE membresias ALTER COLUMN fecha_creacion DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_membresias_fecha_creacion', 'D') IS NULL
      ALTER TABLE membresias ADD CONSTRAINT DF_membresias_fecha_creacion DEFAULT SYSUTCDATETIME() FOR fecha_creacion;
  END

  IF COL_LENGTH('membresias', 'fecha_actualizacion') IS NULL
  BEGIN
    ALTER TABLE membresias ADD fecha_actualizacion DATETIME2 NULL;
    UPDATE membresias SET fecha_actualizacion = SYSUTCDATETIME() WHERE fecha_actualizacion IS NULL;
    ALTER TABLE membresias ALTER COLUMN fecha_actualizacion DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_membresias_fecha_actualizacion', 'D') IS NULL
      ALTER TABLE membresias ADD CONSTRAINT DF_membresias_fecha_actualizacion DEFAULT SYSUTCDATETIME() FOR fecha_actualizacion;
  END

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_membresias_estado')
    ALTER TABLE membresias ADD CONSTRAINT CK_membresias_estado CHECK (estado IN ('activa', 'expirada', 'cancelada', 'suspendida'));

  IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('membresias')
      AND c.name = 'user_id'
      AND t.name = 'uniqueidentifier'
  )
  BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_membresias_user')
      ALTER TABLE membresias DROP CONSTRAINT FK_membresias_user;

    ALTER TABLE membresias
      ADD CONSTRAINT FK_membresias_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
  END
  ELSE
  BEGIN
    PRINT 'WARN: membresias.user_id no es UNIQUEIDENTIFIER. No se creo FK_membresias_user.';
  END

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_membresias_plan')
    ALTER TABLE membresias ADD CONSTRAINT FK_membresias_plan FOREIGN KEY (plan_id) REFERENCES plans(id);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_membresias_subscription_id' AND object_id = OBJECT_ID('membresias'))
  CREATE UNIQUE INDEX UX_membresias_subscription_id ON membresias(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_user_id' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_user_id ON membresias(user_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_estado' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_estado ON membresias(estado);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_fecha_expiracion' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_fecha_expiracion ON membresias(fecha_expiracion);

-- ------------------------------------------------------------
-- 3) stripe_webhooks
-- ------------------------------------------------------------
IF OBJECT_ID('stripe_webhooks', 'U') IS NULL
BEGIN
  CREATE TABLE stripe_webhooks (
    id INT PRIMARY KEY IDENTITY(1,1),
    stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
    tipo_evento VARCHAR(100) NOT NULL,
    datos NVARCHAR(MAX) NOT NULL,
    procesado BIT NOT NULL CONSTRAINT DF_stripe_webhooks_procesado DEFAULT 0,
    fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_stripe_webhooks_fecha DEFAULT SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  IF COL_LENGTH('stripe_webhooks', 'stripe_event_id') IS NULL
    ALTER TABLE stripe_webhooks ADD stripe_event_id VARCHAR(255) NULL;

  IF COL_LENGTH('stripe_webhooks', 'tipo_evento') IS NULL
    ALTER TABLE stripe_webhooks ADD tipo_evento VARCHAR(100) NULL;

  IF COL_LENGTH('stripe_webhooks', 'datos') IS NULL
    ALTER TABLE stripe_webhooks ADD datos NVARCHAR(MAX) NULL;

  IF COL_LENGTH('stripe_webhooks', 'procesado') IS NULL
  BEGIN
    ALTER TABLE stripe_webhooks ADD procesado BIT NULL;
    UPDATE stripe_webhooks SET procesado = 0 WHERE procesado IS NULL;
    ALTER TABLE stripe_webhooks ALTER COLUMN procesado BIT NOT NULL;
    IF OBJECT_ID('DF_stripe_webhooks_procesado', 'D') IS NULL
      ALTER TABLE stripe_webhooks ADD CONSTRAINT DF_stripe_webhooks_procesado DEFAULT 0 FOR procesado;
  END

  IF COL_LENGTH('stripe_webhooks', 'fecha_creacion') IS NULL
  BEGIN
    ALTER TABLE stripe_webhooks ADD fecha_creacion DATETIME2 NULL;
    UPDATE stripe_webhooks SET fecha_creacion = SYSUTCDATETIME() WHERE fecha_creacion IS NULL;
    ALTER TABLE stripe_webhooks ALTER COLUMN fecha_creacion DATETIME2 NOT NULL;
    IF OBJECT_ID('DF_stripe_webhooks_fecha', 'D') IS NULL
      ALTER TABLE stripe_webhooks ADD CONSTRAINT DF_stripe_webhooks_fecha DEFAULT SYSUTCDATETIME() FOR fecha_creacion;
  END
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_webhooks_event_id' AND object_id = OBJECT_ID('stripe_webhooks'))
  CREATE UNIQUE INDEX UX_webhooks_event_id ON stripe_webhooks(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_webhooks_tipo_evento' AND object_id = OBJECT_ID('stripe_webhooks'))
  CREATE INDEX IX_webhooks_tipo_evento ON stripe_webhooks(tipo_evento);

COMMIT TRAN;
