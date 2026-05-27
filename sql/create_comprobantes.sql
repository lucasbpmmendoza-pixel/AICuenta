-- Tabla para comprobantes de pago recibidos via WhatsApp Bot
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Comprobantes') AND type = N'U')
BEGIN
  CREATE TABLE dbo.Comprobantes (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    owner_id            NVARCHAR(200)   NOT NULL,
    remitente_nombre    NVARCHAR(200),
    remitente_telefono  NVARCHAR(50),
    banco               NVARCHAR(100),
    fecha               NVARCHAR(50),
    monto               DECIMAL(18, 2),
    folio               NVARCHAR(100),
    concepto            NVARCHAR(500),
    referencia          NVARCHAR(100),
    clave_rastreo       NVARCHAR(100),
    beneficiario        NVARCHAR(200),
    cuenta_destino      NVARCHAR(50),
    Fuente              NVARCHAR(100),
    created_at          DATETIME2 DEFAULT GETDATE()
  );

  CREATE INDEX IX_Comprobantes_owner_id ON dbo.Comprobantes (owner_id);
  CREATE INDEX IX_Comprobantes_created_at ON dbo.Comprobantes (created_at DESC);
END
