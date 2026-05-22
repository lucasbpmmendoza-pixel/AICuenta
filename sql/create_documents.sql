-- Tabla para documentos del chatbot documental
CREATE TABLE documents (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  titulo      NVARCHAR(500)  NOT NULL,
  categoria   NVARCHAR(100)  NULL,          -- ej: "fiscal", "legal", "nomina", etc.
  tags        NVARCHAR(500)  NULL,          -- palabras clave separadas por coma
  resumen     NVARCHAR(MAX)  NOT NULL,      -- resumen corto para que GPT decida qué doc necesita
  contenido   NVARCHAR(MAX)  NOT NULL,      -- texto completo del PDF para responder preguntas
  activo      BIT            NOT NULL DEFAULT 1,
  created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
  updated_at  DATETIME2      NOT NULL DEFAULT GETDATE()
);

-- Índice para búsqueda por categoría
CREATE INDEX IX_documents_categoria ON documents (categoria) WHERE activo = 1;

-- Ejemplos de inserción
-- INSERT INTO documents (titulo, categoria, tags, resumen, contenido)
-- VALUES (
--   'Resolución Miscelánea Fiscal 2024',
--   'fiscal',
--   'SAT, ISR, IVA, resolución, miscelánea',
--   'Reglas generales en materia fiscal para 2024 emitidas por el SAT, incluyendo ISR, IVA, IEPS y facilidades administrativas.',
--   '... texto completo del documento ...'
-- );
