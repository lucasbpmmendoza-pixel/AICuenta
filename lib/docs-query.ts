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
  contenido_len?: number;
  contenido_truncado?: boolean;
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
  const cleanQuery = query.trim();
  const likeVal = `%${cleanQuery.replace(/[%_[\]]/g, "\\$&")}%`;
  const tokens = cleanQuery
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);

  req.input("q", likeVal);
  req.input("lim", safeLimit);

  const baseFields = ["titulo", "tags", "resumen", "contenido"];

  const likeByFields = (param: string) =>
    baseFields.map((f) => `${f} LIKE ${param} ESCAPE '\\'`).join(" OR ");

  let where = `activo = 1 AND (
    ${likeByFields("@q")}
  )`;

  if (tokens.length > 0) {
    const tokenClauses: string[] = [];
    tokens.forEach((token, i) => {
      const p = `@t${i}`;
      req.input(`t${i}`, `%${token.replace(/[%_[\]]/g, "\\$&")}%`);
      tokenClauses.push(`(${likeByFields(p)})`);
    });

    where = `activo = 1 AND ((
      ${likeByFields("@q")}
    ) OR (
      ${tokenClauses.join(" OR ")}
    ))`;
  }

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
 * Devuelve un extracto del contenido de un documento por su ID para evitar
 * sobrecargar el contexto del modelo.
 */
export async function docsGetDetail(id: number, maxChars = 8000): Promise<DocDetail | null> {
  const db = await getDb();
  const req = db.request();
  req.input("id", id);
  req.input("maxChars", Math.max(500, Math.min(20000, maxChars)));

  const result = await req.query(`
    SELECT id, titulo, categoria, tags, resumen,
           LEFT(contenido, @maxChars) AS contenido,
           LEN(contenido) AS contenido_len,
           CONVERT(VARCHAR(23), created_at, 126) AS created_at
    FROM documents
    WHERE id = @id AND activo = 1
  `);

  if (!result.recordset.length) return null;
  const row = result.recordset[0] as DocDetail;
  row.contenido_truncado = (row.contenido_len ?? 0) > row.contenido.length;
  return row;
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
