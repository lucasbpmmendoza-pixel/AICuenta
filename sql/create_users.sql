-- ============================================================
-- AIcuenta · Tabla de usuarios
-- Azure SQL Database
-- ============================================================

CREATE TABLE users (
  id            UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
  name          NVARCHAR(120)     NOT NULL,
  email         NVARCHAR(254)     NOT NULL,
  rfc           NVARCHAR(13)      NULL,              -- se completa después del registro
  password_hash NVARCHAR(72)      NOT NULL,   -- bcrypt max 72 bytes
  is_active     BIT               NOT NULL DEFAULT 1,
  email_verified BIT              NOT NULL DEFAULT 0,
  created_at    DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_users           PRIMARY KEY (id),
  CONSTRAINT UQ_users_email     UNIQUE      (email),
  CONSTRAINT UQ_users_rfc       UNIQUE      (rfc)
);

-- Índice para lookup por email (login)
CREATE INDEX IX_users_email ON users (email);

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER TR_users_updated_at
ON users
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE users
  SET    updated_at = SYSUTCDATETIME()
  FROM   users u
  INNER JOIN inserted i ON u.id = i.id;
END;
GO
