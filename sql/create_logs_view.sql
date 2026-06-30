-- ============================================================
-- AIcuenta · Vista de logs con nombre del usuario
-- Azure SQL Database (SQL Server)
--
-- La tabla "logs" guarda solo user_id (el GUID), que es difícil de leer.
-- Esta vista une logs con users para mostrar nombre y correo.
-- Se usa LEFT JOIN para que un log siga apareciendo aunque el usuario
-- ya no exista (nombre/correo saldrían NULL).
--
-- Uso:   SELECT * FROM logs_con_nombre ORDER BY lastupdate DESC;
--
-- CREATE OR ALTER permite volver a ejecutarlo sin error si ya existe.
-- ============================================================

CREATE OR ALTER VIEW logs_con_nombre AS
SELECT
  u.name  AS nombre,
  u.email AS correo,
  l.*
FROM logs l
LEFT JOIN users u
  ON CAST(u.id AS NVARCHAR(36)) = l.user_id;
