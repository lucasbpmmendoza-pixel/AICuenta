import { getDb } from "@/lib/db";

export interface DocSearchResult {
  id: number;
  titulo: string;
  categoria: string | null;
  tags: string | null;
  resumen: string;
}

export interface DocDetail extends DocSearchResult {
  contenido: string;
  created_at: string;
}

/**
 * Busca documentos por texto libre (titulo, tags, resumen) y opcionalmente por categoría.
 * Devuelve id + resumen para que GPT elija cuál necesita en detalle.
 */
export async function docsSearch(
  query: string,
  categoria?: string,
  limit = 10,
): Promise<DocSearchResult[]> {
  const db = await getDb();
  const req = db.request();

  const safeLimit = Math.min(Math.max(1, limit), 50);
  const likeVal = `%${query.replace(/[%_[\]]/g, "\\$&")}%`;

  req.input("q", likeVal);
  req.input("lim", safeLimit);

  let where = `activo = 1 AND (
    titulo   LIKE @q ESCAPE '\\' OR
    tags     LIKE @q ESCAPE '\\' OR
    resumen  LIKE @q ESCAPE '\\'
  )`;

  if (categoria) {
    req.input("cat", categoria.trim());
    where += " AND categoria = @cat";
  }

  const result = await req.query(`
    SELECT TOP (@lim) id, titulo, categoria, tags, resumen
    FROM documents
    WHERE ${where}
    ORDER BY id DESC
  `);

  return result.recordset as DocSearchResult[];
}

/**
 * Devuelve el contenido completo de un documento por su ID.
 */
export async function docsGetDetail(id: number): Promise<DocDetail | null> {
  const db = await getDb();
  const req = db.request();
  req.input("id", id);

  const result = await req.query(`
    SELECT id, titulo, categoria, tags, resumen, contenido,
           CONVERT(VARCHAR(23), created_at, 126) AS created_at
    FROM documents
    WHERE id = @id AND activo = 1
  `);

  if (!result.recordset.length) return null;
  return result.recordset[0] as DocDetail;
}

/**
 * Lista todas las categorías disponibles con conteo de documentos.
 */
export async function docsListCategorias(): Promise<{ categoria: string; total: number }[]> {
  const db = await getDb();
  const result = await db.request().query(`
    SELECT categoria, COUNT(*) AS total
    FROM documents
    WHERE activo = 1 AND categoria IS NOT NULL
    GROUP BY categoria
    ORDER BY total DESC
  `);
  return result.recordset as { categoria: string; total: number }[];
}
