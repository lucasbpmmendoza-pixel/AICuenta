-- ============================================================
-- AIcuenta · Tabla de Cédulas de Identificación Fiscal (CIF)
-- Azure SQL Database
-- ============================================================
-- Almacena los datos extraídos de la cédula fiscal del SAT.
-- NO se guarda el PDF; solo los campos estructurados que devuelve OpenAI.
-- Está enlazada al user_id (dueño) y al RFC al que pertenece la cédula.
-- ============================================================

CREATE TABLE cedulas_fiscales (
  id                          INT IDENTITY(1,1) NOT NULL,
  user_id                     UNIQUEIDENTIFIER  NOT NULL,         -- dueño de la cuenta (ownerId)
  rfc                         NVARCHAR(13)      NOT NULL,         -- RFC asociado (extraído de la CIF)

  -- Identificación
  curp                        NVARCHAR(18)      NULL,
  nombre                      NVARCHAR(300)     NULL,             -- persona física
  razon_social                NVARCHAR(300)     NULL,             -- persona moral
  tipo_persona                NVARCHAR(20)      NULL,             -- 'fisica' | 'moral'
  nombre_comercial            NVARCHAR(300)     NULL,

  -- Estatus
  fecha_inicio_operaciones    DATE              NULL,
  situacion_contribuyente     NVARCHAR(100)     NULL,
  fecha_ultimo_cambio_estado  DATE              NULL,
  fecha_emision_cif           DATE              NULL,
  idcif                       NVARCHAR(50)      NULL,

  -- Domicilio fiscal
  codigo_postal               NVARCHAR(10)      NULL,
  calle                       NVARCHAR(200)     NULL,
  numero_exterior             NVARCHAR(20)      NULL,
  numero_interior             NVARCHAR(20)      NULL,
  colonia                     NVARCHAR(150)     NULL,
  municipio                   NVARCHAR(150)     NULL,
  estado                      NVARCHAR(100)     NULL,
  entre_calles                NVARCHAR(300)     NULL,
  tipo_vialidad               NVARCHAR(50)      NULL,

  -- Arreglos como JSON (regímenes, actividades económicas, obligaciones)
  regimenes                   NVARCHAR(MAX)     NULL,
  actividades_economicas      NVARCHAR(MAX)     NULL,
  obligaciones                NVARCHAR(MAX)     NULL,

  -- JSON completo (fallback para datos que no quepan en columnas)
  raw_json                    NVARCHAR(MAX)     NOT NULL,

  activo                      BIT               NOT NULL DEFAULT 1,
  created_at                  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at                  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_cedulas_fiscales         PRIMARY KEY (id),
  CONSTRAINT FK_cedulas_fiscales_user    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT UQ_cedulas_fiscales_user_rfc UNIQUE (user_id, rfc)
);

CREATE INDEX IX_cedulas_fiscales_user ON cedulas_fiscales (user_id) WHERE activo = 1;
CREATE INDEX IX_cedulas_fiscales_rfc  ON cedulas_fiscales (rfc)     WHERE activo = 1;

-- Trigger para mantener updated_at
GO
CREATE TRIGGER TR_cedulas_fiscales_updated_at
ON cedulas_fiscales
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE cedulas_fiscales
  SET    updated_at = SYSUTCDATETIME()
  FROM   cedulas_fiscales c
  INNER JOIN inserted i ON c.id = i.id;
END;
GO
