-- Si la tabla ya fue creada con user_id INT, ejecuta esto para cambiar el tipo:
ALTER TABLE logs ALTER COLUMN user_id NVARCHAR(36) NOT NULL;
