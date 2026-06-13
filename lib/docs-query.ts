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

export interface CatProdResult {
  clave: string;
  descripcion: string;
}

/**
 * Busca claves de producto/servicio SAT en tb_catprodserv.
 * Si `query` es un número/código busca por prefijo de clave; si no, busca por descripción LIKE.
 * Limita siempre a TOP N para no saturar el contexto.
 */
export async function catprodSearch(query: string, limit = 20): Promise<CatProdResult[]> {
  const db = await getDb();
  const req = db.request();

  const safeLimit = Math.min(Math.max(1, limit), 50);
  const clean = query.trim().replace(/[%_[\]]/g, "\\$&");

  req.input("lim", safeLimit);
  req.input("exactClave", clean.toUpperCase());
  req.input("likeClave", `${clean.toUpperCase()}%`);
  req.input("likeDesc", `%${clean}%`);

  // Prioridad: coincidencia exacta de clave > prefijo de clave > descripción
  const result = await req.query<CatProdResult>(`
    SELECT TOP (@lim) clave, descripcion
    FROM tb_catprodserv WITH (NOLOCK)
    WHERE clave = @exactClave
       OR clave LIKE @likeClave ESCAPE '\\'
       OR descripcion LIKE @likeDesc ESCAPE '\\'
    ORDER BY
      CASE WHEN clave = @exactClave THEN 0
           WHEN clave LIKE @likeClave ESCAPE '\\' THEN 1
           ELSE 2 END,
      clave
  `);
  return result.recordset;
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

export interface CedulaSearchResult {
  id: number;
  rfc: string;
  razon_social: string | null;
  nombre: string | null;
  tipo_persona: string | null;
  situacion_contribuyente: string | null;
  codigo_postal: string | null;
  regimenes: unknown;
  actividades_economicas: unknown;
  obligaciones: unknown;
  domicilio: {
    calle: string | null;
    numero_exterior: string | null;
    numero_interior: string | null;
    colonia: string | null;
    municipio: string | null;
    estado: string | null;
    codigo_postal: string | null;
  };
  curp: string | null;
  fecha_inicio_operaciones: string | null;
  idcif: string | null;
  fecha_emision_cif: string | null;
  created_at: string;
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * Busca cédulas fiscales del usuario por RFC, nombre o razón social.
 * Scoped al ownerId para que cada usuario solo vea sus cédulas.
 */
export async function cedulasSearch(
  ownerId: string,
  query: string,
  limit = 5,
): Promise<CedulaSearchResult[]> {
  const db = await getDb();
  const req = db.request();

  const safeLimit = Math.min(Math.max(1, limit), 20);
  const clean = query.trim();
  const likeVal = `%${clean.replace(/[%_[\]]/g, "\\$&")}%`;

  req.input("owner", ownerId);
  req.input("lim", safeLimit);
  req.input("rfcExact", clean.toUpperCase());
  req.input("q", likeVal);

  const result = await req.query(`
    SELECT TOP (@lim)
      id, rfc, razon_social, nombre, tipo_persona, situacion_contribuyente,
      curp, fecha_inicio_operaciones, fecha_emision_cif, idcif,
      codigo_postal, calle, numero_exterior, numero_interior, colonia, municipio, estado,
      regimenes, actividades_economicas, obligaciones,
      CONVERT(VARCHAR(23), created_at, 126) AS created_at
    FROM cedulas_fiscales
    WHERE activo = 1
      AND user_id = @owner
      AND (
        rfc = @rfcExact
        OR rfc LIKE @q ESCAPE '\\'
        OR razon_social LIKE @q ESCAPE '\\'
        OR nombre LIKE @q ESCAPE '\\'
        OR nombre_comercial LIKE @q ESCAPE '\\'
      )
    ORDER BY
      CASE WHEN rfc = @rfcExact THEN 0 ELSE 1 END,
      id DESC
  `);

  return result.recordset.map((row): CedulaSearchResult => ({
    id: row.id,
    rfc: row.rfc,
    razon_social: row.razon_social ?? null,
    nombre: row.nombre ?? null,
    tipo_persona: row.tipo_persona ?? null,
    situacion_contribuyente: row.situacion_contribuyente ?? null,
    codigo_postal: row.codigo_postal ?? null,
    curp: row.curp ?? null,
    fecha_inicio_operaciones: row.fecha_inicio_operaciones ?? null,
    fecha_emision_cif: row.fecha_emision_cif ?? null,
    idcif: row.idcif ?? null,
    regimenes: safeJsonParse(row.regimenes),
    actividades_economicas: safeJsonParse(row.actividades_economicas),
    obligaciones: safeJsonParse(row.obligaciones),
    domicilio: {
      calle: row.calle ?? null,
      numero_exterior: row.numero_exterior ?? null,
      numero_interior: row.numero_interior ?? null,
      colonia: row.colonia ?? null,
      municipio: row.municipio ?? null,
      estado: row.estado ?? null,
      codigo_postal: row.codigo_postal ?? null,
    },
    created_at: row.created_at,
  }));
}
