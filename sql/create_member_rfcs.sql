-- ============================================================
-- AIcuenta · Tabla de RFCs asignados a miembros del equipo
-- Azure SQL Database
-- ============================================================

CREATE TABLE member_rfcs (
  member_id   INT              NOT NULL,
  efiel_id    UNIQUEIDENTIFIER NOT NULL,
  created_at  DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

  CONSTRAINT PK_member_rfcs        PRIMARY KEY (member_id, efiel_id),
  CONSTRAINT FK_member_rfcs_member FOREIGN KEY (member_id) REFERENCES dbo.Usuarios (id) ON DELETE CASCADE,
  CONSTRAINT FK_member_rfcs_efiel  FOREIGN KEY (efiel_id)  REFERENCES dbo.EFIELES (id) ON DELETE NO ACTION
);

CREATE INDEX IX_member_rfcs_member ON member_rfcs (member_id);
CREATE INDEX IX_member_rfcs_efiel  ON member_rfcs (efiel_id);
