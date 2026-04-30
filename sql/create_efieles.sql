-- ============================================================
-- AIcuenta · Tabla de FIELs registradas
-- Azure SQL Database
-- ============================================================

CREATE TABLE EFIELES (
  id            UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
  user_id       UNIQUEIDENTIFIER  NOT NULL,
  rfc           NVARCHAR(13)      NOT NULL,
  fiel          NVARCHAR(500)     NOT NULL,          -- contraseña de la e.firma
  descargada    BIT               NOT NULL DEFAULT 0,
  request       INT               NOT NULL DEFAULT 0,
  created_at    DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
  last_update   DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_efieles          PRIMARY KEY (id),
  CONSTRAINT FK_efieles_user     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT UQ_efieles_user_rfc UNIQUE (user_id, rfc)
);

CREATE INDEX IX_efieles_user_id ON EFIELES (user_id);

-- Trigger para mantener updated_at y last_update al día
CREATE TRIGGER TR_efieles_updated_at
ON EFIELES
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE EFIELES
  SET    updated_at  = SYSUTCDATETIME(),
         last_update = SYSUTCDATETIME()
  FROM   EFIELES e
  INNER JOIN inserted i ON e.id = i.id;
END;
GO
