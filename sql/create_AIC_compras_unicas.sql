-- Compras one-time (pay-per-download / add-ons mensuales).
-- Modelo derivado (mismo estilo que membresias): la disponibilidad se calcula
-- consultando esta tabla, no hay flags en users.
--
-- Prefijo AIC_: tablas propias de este feature (compras unicas + catalogo
-- productos_one_time) para diferenciarlas rapido del resto del esquema.
--
-- tipos:
--   'cuadro_download'       => 1 sola descarga del cuadro clasificado (freemium)
--   'comparar_auditar_mes'  => desbloquea Comparar+Auditar por el mes calendario
--                              indicado en periodo_year/periodo_month (paid users)
--
-- estados:
--   'pendiente'  => se creo la Checkout Session, aun no llega el webhook
--   'pagada'     => webhook confirmo pago; disponible para consumir/usar
--   'consumida'  => usada (solo aplica a cuadro_download)

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AIC_compras_unicas')
CREATE TABLE AIC_compras_unicas (
  id INT PRIMARY KEY IDENTITY(1,1),
  user_id UNIQUEIDENTIFIER NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  stripe_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  monto_centavos INT NOT NULL,   -- Stripe usa centavos; 5000 = 50 MXN
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  periodo_year INT NULL,
  periodo_month INT NULL,
  fecha_creacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  fecha_pago DATETIME2 NULL,
  fecha_consumo DATETIME2 NULL,

  CONSTRAINT CK_AIC_compras_unicas_tipo
    CHECK (tipo IN ('cuadro_download','comparar_auditar_mes')),
  CONSTRAINT CK_AIC_compras_unicas_estado
    CHECK (estado IN ('pendiente','pagada','consumida')),
  CONSTRAINT CK_AIC_compras_unicas_periodo_mes
    CHECK (periodo_month IS NULL OR periodo_month BETWEEN 1 AND 12),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AIC_compras_unicas_user_tipo_estado' AND object_id = OBJECT_ID('AIC_compras_unicas'))
  CREATE INDEX IX_AIC_compras_unicas_user_tipo_estado
    ON AIC_compras_unicas(user_id, tipo, estado);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AIC_compras_unicas_session' AND object_id = OBJECT_ID('AIC_compras_unicas'))
  CREATE UNIQUE INDEX IX_AIC_compras_unicas_session
    ON AIC_compras_unicas(stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AIC_compras_unicas_periodo' AND object_id = OBJECT_ID('AIC_compras_unicas'))
  CREATE INDEX IX_AIC_compras_unicas_periodo
    ON AIC_compras_unicas(user_id, tipo, periodo_year, periodo_month)
    WHERE tipo = 'comparar_auditar_mes';
