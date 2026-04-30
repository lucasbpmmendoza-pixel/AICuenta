-- ============================================================
-- AIcuenta · Tabla de tickets de soporte
-- Azure SQL Database
-- ============================================================

CREATE TABLE support_tickets (
  id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
  user_id     UNIQUEIDENTIFIER  NOT NULL,
  subject     NVARCHAR(160)     NOT NULL,
  message     NVARCHAR(MAX)     NOT NULL,
  status      NVARCHAR(20)      NOT NULL DEFAULT 'open',  -- open | in_progress | resolved
  created_at  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_support_tickets      PRIMARY KEY (id),
  CONSTRAINT FK_support_tickets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IX_support_tickets_user_id ON support_tickets (user_id);

CREATE TRIGGER TR_support_tickets_updated_at
ON support_tickets
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE support_tickets
  SET    updated_at = SYSUTCDATETIME()
  FROM   support_tickets t
  INNER JOIN inserted i ON t.id = i.id;
END;
GO
