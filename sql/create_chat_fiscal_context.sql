-- ============================================================
-- AIcuenta · Tabla de contexto del Asistente Fiscal IA
-- Guarda los últimos N mensajes por usuario + RFC para
-- mantener coherencia de conversación entre sesiones.
-- ============================================================

CREATE TABLE chat_fiscal_context (
  user_id     UNIQUEIDENTIFIER  NOT NULL,
  rfc         NVARCHAR(20)      NOT NULL,
  messages    NVARCHAR(MAX)     NOT NULL,   -- JSON: [{role, content}, ...]
  updated_at  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_chat_fiscal_context PRIMARY KEY (user_id, rfc),
  CONSTRAINT FK_chat_fiscal_context_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IX_chat_fiscal_context_updated ON chat_fiscal_context (updated_at);
