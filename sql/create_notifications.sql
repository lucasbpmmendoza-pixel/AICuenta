-- ============================================================
-- AIcuenta · Tabla de notificaciones
-- Azure SQL Database
-- ============================================================

CREATE TABLE notifications (
  id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWSEQUENTIALID(),
  user_id     UNIQUEIDENTIFIER  NOT NULL,              -- usuario destinatario
  title       NVARCHAR(200)     NOT NULL,
  body        NVARCHAR(1000)    NULL,
  type        NVARCHAR(20)      NOT NULL DEFAULT 'info',  -- info | warning | success | error
  link        NVARCHAR(500)     NULL,                  -- ruta interna opcional al hacer clic
  is_read     BIT               NOT NULL DEFAULT 0,
  created_at  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_notifications      PRIMARY KEY (id),
  CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT CK_notifications_type CHECK (type IN ('info','warning','success','error'))
);

-- Índice compuesto para la query principal: user + no leídas + orden por fecha
CREATE INDEX IX_notifications_user_read_date
  ON notifications (user_id, is_read, created_at DESC);
