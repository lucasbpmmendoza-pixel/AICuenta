-- Catalogo de productos de pago unico (Stripe mode=payment).
-- Analogo a `plans` pero para one-time; solo 2 filas fijas.
--
-- Prefijo AIC_: tablas propias de este feature (compras unicas + catalogo
-- productos_one_time) para diferenciarlas rapido del resto del esquema.
--
-- Flujo de setup:
--   1. Corre este script (crea la tabla + inserta las 2 filas 'inactivas').
--   2. Ve al dashboard de Stripe, dentro del product AICuenta, y crea:
--        - Un price one-time de 50 MXN  -> anota su price_id
--        - Un price one-time de 100 MXN -> anota su price_id
--   3. Corre los UPDATEs de abajo con tus price_ids para activarlos.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AIC_productos_one_time')
CREATE TABLE AIC_productos_one_time (
  id INT PRIMARY KEY IDENTITY(1,1),
  tipo VARCHAR(30) NOT NULL UNIQUE,
  nombre NVARCHAR(100) NOT NULL,
  monto_centavos INT NOT NULL,   -- Stripe usa centavos; 5000 = 50 MXN, 10000 = 100 MXN
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  stripe_price_id VARCHAR(255) NULL,
  es_activo BIT NOT NULL DEFAULT 1,
  fecha_creacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  fecha_actualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT CK_AIC_productos_one_time_tipo
    CHECK (tipo IN ('cuadro_download','comparar_auditar_mes'))
);

-- Semilla: 2 filas fijas. Idempotente: si ya existen no las duplica.
-- Ambas quedan `es_activo = 1` desde el arranque; mientras stripe_price_id
-- sea NULL el endpoint de checkout devuelve 503 "Producto no configurado".
IF NOT EXISTS (SELECT 1 FROM AIC_productos_one_time WHERE tipo = 'cuadro_download')
  INSERT INTO AIC_productos_one_time (tipo, nombre, monto_centavos, stripe_price_id)
  VALUES ('cuadro_download', N'Descarga del cuadro AICuenta', 5000, NULL);

IF NOT EXISTS (SELECT 1 FROM AIC_productos_one_time WHERE tipo = 'comparar_auditar_mes')
  INSERT INTO AIC_productos_one_time (tipo, nombre, monto_centavos, stripe_price_id)
  VALUES ('comparar_auditar_mes', N'Comparar + Auditar (mes)', 10000, NULL);

-- === Paso final (correr a mano tras crear los prices en Stripe) ==============
-- Solo pega los price_id; el resto (nombre, monto, es_activo) ya quedo listo.
--
-- UPDATE AIC_productos_one_time
--   SET stripe_price_id = 'price_XXXXXXXXXXXXXXXX'
--   WHERE tipo = 'cuadro_download';
--
-- UPDATE AIC_productos_one_time
--   SET stripe_price_id = 'price_YYYYYYYYYYYYYYYY'
--   WHERE tipo = 'comparar_auditar_mes';
