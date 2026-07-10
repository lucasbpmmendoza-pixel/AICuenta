-- Backfill: la distincion single/multi se quito de la UX hace tiempo.
-- Todos los usuarios owners (role != 'member') deben quedar como 'multi'.
-- Los members se dejan intactos: no pasan por el gate de upload-fiel porque
-- las pages del dashboard hacen redirect('/dashboard') si role='member'.
--
-- Es idempotente: solo afecta filas con account_type NULL.

UPDATE users
  SET account_type = 'multi'
  WHERE account_type IS NULL
    AND (role IS NULL OR role <> 'member');

-- Verifica el resultado:
-- SELECT account_type, role, COUNT(*) FROM users GROUP BY account_type, role;
