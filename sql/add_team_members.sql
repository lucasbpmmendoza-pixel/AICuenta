-- ============================================================
-- AIcuenta · Migración: agregar owner_id y role a users
-- Azure SQL Database
-- Ejecutar una sola vez
-- ============================================================

-- 1. Agregar columnas
ALTER TABLE users
  ADD owner_id UNIQUEIDENTIFIER NULL,
      role     NVARCHAR(20)      NOT NULL DEFAULT 'owner';

-- 2. FK: owner_id → users.id (CASCADE al borrar al dueño borra sus miembros)
ALTER TABLE users
  ADD CONSTRAINT FK_users_owner
      FOREIGN KEY (owner_id) REFERENCES users (id)
      ON DELETE NO ACTION;   -- evita ciclo; se borra en app o con DELETE manual

-- 3. Índice para listar miembros de una cuenta rápido
CREATE INDEX IX_users_owner_id ON users (owner_id) WHERE owner_id IS NOT NULL;
