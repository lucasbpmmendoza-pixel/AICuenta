-- Tabla de Planes de Suscripción
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plans')
CREATE TABLE plans (
  id INT PRIMARY KEY IDENTITY(1,1),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  costo DECIMAL(10, 2) NOT NULL,
  duracion_meses INT NOT NULL CHECK (duracion_meses IN (1, 3, 6, 12)),
  stripe_product_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
  descripcion NVARCHAR(MAX),
  es_activo BIT DEFAULT 1,
  fecha_creacion DATETIME2 DEFAULT SYSUTCDATETIME(),
  fecha_actualizacion DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Tabla de Membresías/Suscripciones
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'membresias')
CREATE TABLE membresias (
  id INT PRIMARY KEY IDENTITY(1,1),
  user_id UNIQUEIDENTIFIER NOT NULL,
  plan_id INT NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255),
  fecha_inicio DATETIME NOT NULL DEFAULT GETDATE(),
  fecha_expiracion DATETIME NOT NULL,
  estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'expirada', 'cancelada', 'suspendida')),
  renovacion_automatica BIT DEFAULT 1,
  fecha_pago DATETIME2,
  fecha_cancelacion DATETIME2 NULL,
  razon_cancelacion NVARCHAR(MAX),
  fecha_creacion DATETIME2 DEFAULT SYSUTCDATETIME(),
  fecha_actualizacion DATETIME2 DEFAULT SYSUTCDATETIME(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Tabla de Webhooks de Stripe (para auditoría)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'stripe_webhooks')
CREATE TABLE stripe_webhooks (
  id INT PRIMARY KEY IDENTITY(1,1),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  tipo_evento VARCHAR(100) NOT NULL,
  datos NVARCHAR(MAX) NOT NULL,
  procesado BIT DEFAULT 0,
  fecha_creacion DATETIME2 DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_user_id' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_user_id ON membresias(user_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_subscription_id' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_subscription_id ON membresias(stripe_subscription_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_estado' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_estado ON membresias(estado);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_membresias_fecha_expiracion' AND object_id = OBJECT_ID('membresias'))
  CREATE INDEX IX_membresias_fecha_expiracion ON membresias(fecha_expiracion);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_webhooks_event_id' AND object_id = OBJECT_ID('stripe_webhooks'))
  CREATE INDEX IX_webhooks_event_id ON stripe_webhooks(stripe_event_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_webhooks_tipo_evento' AND object_id = OBJECT_ID('stripe_webhooks'))
  CREATE INDEX IX_webhooks_tipo_evento ON stripe_webhooks(tipo_evento);
