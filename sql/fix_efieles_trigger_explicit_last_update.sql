-- ============================================================
-- AIcuenta · Modificacion de TR_efieles_updated_at
--   El trigger original siempre forzaba last_update = SYSUTCDATETIME(),
--   lo que impedia setear el campo a un valor explicito (por ejemplo,
--   primer dia del mes en cuentas gratis, o 5 anios atras en upgrade).
--
--   Esta version usa UPDATE(last_update) para detectar si la sentencia
--   UPDATE menciono la columna explicitamente. Si si, se respeta el valor
--   que envio la aplicacion. Si no, se rellena con NOW como antes.
--
--   updated_at sigue siendo overwriteado siempre (eso no cambia).
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_efieles_updated_at')
  DROP TRIGGER TR_efieles_updated_at;
GO

CREATE TRIGGER TR_efieles_updated_at
ON EFIELES
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  -- updated_at: siempre se actualiza con el tiempo del cambio
  UPDATE EFIELES
  SET    updated_at = SYSUTCDATETIME()
  FROM   EFIELES e
  INNER JOIN inserted i ON e.id = i.id;

  -- last_update: solo se sobrescribe si la sentencia UPDATE NO lo modifico
  -- explicitamente. Asi la aplicacion puede setearlo a primer-dia-del-mes
  -- (cuentas free) o a hace 5 anios (upgrade) sin que el trigger lo pise.
  IF NOT UPDATE(last_update)
  BEGIN
    UPDATE EFIELES
    SET    last_update = SYSUTCDATETIME()
    FROM   EFIELES e
    INNER JOIN inserted i ON e.id = i.id;
  END
END;
GO
