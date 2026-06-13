import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { docsSearch, docsGetDetail, docsListCategorias, catprodSearch, cedulasSearch } from "@/lib/docs-query";
import { createChatDocsExport } from "../../../lib/chat-docs-export-store";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PREMIUM_MODEL = process.env.CHAT_DOCS_MODEL_PREMIUM ?? "gpt-4o-mini";
const PUBLIC_MODEL = process.env.CHAT_DOCS_MODEL_PUBLIC ?? "gpt-4o-mini";

const PREMIUM_MAX_HISTORY_MESSAGES = 8;
const PUBLIC_MAX_HISTORY_MESSAGES = 4;
const PREMIUM_MAX_MESSAGE_CHARS = 1500;
const PUBLIC_MAX_MESSAGE_CHARS = 700;

const PUBLIC_MAX_MESSAGES_PER_DAY = Math.min(
  100,
  Math.max(1, parseInt(process.env.PUBLIC_CHAT_DOCS_DAILY_LIMIT ?? "30", 10) || 30),
);
const MAX_DOC_CHARS = 8000;
const MAX_TOOL_RESULT_CHARS = 12000;

type PublicUsageBucket = {
  count: number;
  resetAt: number;
};

const publicUsage = new Map<string, PublicUsageBucket>();

const SYSTEM_PROMPT = `Eres un asistente experto en consulta de documentos internos.
Tu trabajo es responder preguntas usando únicamente la información de los documentos disponibles en la base de datos.

Reglas obligatorias:
- Antes de responder cualquier pregunta, usa docs_search para encontrar documentos relevantes.
- Si el resultado de docs_search no tiene suficiente detalle, usa docs_get_detail para obtener el contenido completo del documento.
- Si necesitas saber qué categorías existen, usa docs_list_categorias.
- Cuando el usuario pregunte sobre claves de producto o servicio SAT, conceptos CFDI, descripciones de productos o servicios, o necesite identificar la clave SAT correcta para un artículo, usa catprod_search para buscar en el catálogo oficial del SAT.
- Cuando el usuario pregunte sobre SU cédula fiscal (RFC propio, domicilio fiscal, régimen, situación, obligaciones, actividades económicas, CURP, IDCIF), usa cedulas_search para consultar las cédulas que él mismo registró.
- Si el usuario pide generar un Excel, usa create_excel con datos estructurados y luego incluye en tu respuesta el campo download_url devuelto por la herramienta.
- Nunca inventes información; si no encuentras datos relevantes en los documentos, dilo explícitamente.
- Cita el título del documento fuente cuando respondas.
- Responde siempre en español claro y profesional.
- Si el usuario pregunta algo que no está cubierto por los documentos disponibles, indícalo con claridad.`;

const FALLBACK_SYSTEM_PROMPT = `Eres un asistente fiscal y documental en español.
No se encontró información suficiente en la base documental interna para la pregunta del usuario.

Responde directamente con conocimiento general del modelo de forma clara y útil.
Si la pregunta es de leyes fiscales (IVA, ISR, CFDI, SAT), da una explicación práctica y ordenada.
Si hay riesgo de variación por régimen o contexto, indícalo brevemente.
No digas que no encontraste documentos internos; simplemente responde la pregunta.`;

const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "docs_search",
      description:
        "Busca documentos relevantes por palabras clave en título, tags y resumen. Devuelve una lista de documentos con su ID y resumen. Usa esta herramienta primero para encontrar qué documentos son útiles.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Palabras clave o frase para buscar en los documentos",
          },
          categoria: {
            type: "string",
            description: "Filtrar por categoría (ej: fiscal, legal, nomina). Omitir para buscar en todas.",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (1-20)",
            default: 5,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docs_get_detail",
      description:
        "Obtiene un extracto del contenido de un documento por su ID. Usa esta herramienta cuando docs_search encuentre un documento relevante y necesites más detalle sin cargar todo el documento.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "ID del documento (obtenido de docs_search)",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docs_list_categorias",
      description:
        "Lista todas las categorías de documentos disponibles con el número de documentos en cada una. Útil para orientar al usuario sobre qué temas están cubiertos.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catprod_search",
      description:
        "Busca claves de producto o servicio SAT (ClaveProdServ) en el catálogo oficial del SAT. Usa esta herramienta cuando el usuario pregunte por claves SAT de productos/servicios, conceptos de facturas, descripciones de artículos o servicios para facturación, o quiera saber qué clave usar en su CFDI.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Clave numérica (ej: 84111506) o palabras de la descripción del producto/servicio (ej: 'software contabilidad', 'consultoría', 'alimentos')",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (1-30, por defecto 20)",
            default: 20,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cedulas_search",
      description:
        "Busca cédulas de identificación fiscal (CIF) registradas por el usuario en sesión. Filtra por RFC, razón social o nombre. Úsala cuando el usuario pregunte por datos de su cédula fiscal: domicilio fiscal, régimen, obligaciones, actividades económicas, situación, CURP, IDCIF, etc.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "RFC, razón social, nombre o palabra clave para buscar en las cédulas del usuario",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (1-10)",
            default: 5,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_excel",
      description:
        "Genera un archivo Excel (.xlsx) a partir de columnas y filas estructuradas. Usa esta herramienta cuando el usuario pida descargar, exportar o generar un Excel.",
      parameters: {
        type: "object",
        properties: {
          fileName: {
            type: "string",
            description: "Nombre del archivo a generar, por ejemplo reporte_fiscal.xlsx",
          },
          sheetName: {
            type: "string",
            description: "Nombre de la hoja de calculo",
          },
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Lista de columnas en orden",
          },
          rows: {
            type: "array",
            description: "Arreglo de objetos, donde cada objeto representa una fila y usa como llaves las columnas",
            items: {
              type: "object",
              additionalProperties: {
                anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
              },
            },
          },
        },
        required: ["rows"],
        additionalProperties: false,
      },
    },
  },
];

function normalizeExcelRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => row as Record<string, unknown>);
}

function normalizeExcelColumns(
  rawColumns: unknown,
  rows: Record<string, unknown>[],
): string[] {
  if (Array.isArray(rawColumns)) {
    const cols = rawColumns
      .filter((v) => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
    if (cols.length > 0) return Array.from(new Set(cols));
  }

  const first = rows[0];
  if (!first) return [];
  return Object.keys(first);
}

function sanitizeExcelFileName(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  const normalized = raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const withFallback = normalized || `reporte_docs_${new Date().toISOString().slice(0, 10)}`;
  return withFallback.toLowerCase().endsWith(".xlsx") ? withFallback : `${withFallback}.xlsx`;
}

async function createExcelFromRows(args: Record<string, unknown>) {
  const rows = normalizeExcelRows(args.rows);
  if (rows.length === 0) {
    return { error: "rows requerido y debe contener al menos una fila" };
  }
  if (rows.length > 3000) {
    return { error: "rows excede el maximo permitido (3000)" };
  }

  const columns = normalizeExcelColumns(args.columns, rows);
  if (columns.length === 0) {
    return { error: "No se pudieron inferir columnas para el Excel" };
  }

  const workbook = new ExcelJS.Workbook();
  const sheetName =
    typeof args.sheetName === "string" && args.sheetName.trim().length > 0
      ? args.sheetName.trim().slice(0, 31)
      : "Reporte";
  const ws = workbook.addWorksheet(sheetName);

  ws.columns = columns.map((col) => ({
    header: col,
    key: col,
    width: Math.max(12, Math.min(40, col.length + 4)),
  }));

  for (const row of rows) {
    const normalized: Record<string, unknown> = {};
    for (const col of columns) {
      const value = row[col];
      normalized[col] = value === undefined ? null : value;
    }
    ws.addRow(normalized);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const fileName = sanitizeExcelFileName(args.fileName);
  const buf = Buffer.from(await workbook.xlsx.writeBuffer());
  const exported = createChatDocsExport(buf, fileName);

  return {
    ok: true,
    file_name: exported.fileName,
    download_url: exported.url,
    expires_at: exported.expiresAt,
  };
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sanitizeChatMessages(
  messages: unknown[],
  options: { maxHistory: number; maxChars: number },
): ChatCompletionMessageParam[] {
  return (messages as { role?: unknown; content?: unknown }[])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-options.maxHistory)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, options.maxChars),
    }));
}

function getResetAt(now: number): number {
  return now + 24 * 60 * 60 * 1000;
}

async function getPublicClientId(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  const fallback = requestHeaders.get("host")?.trim() ?? "unknown-host";
  const id = forwardedFor || realIp || fallback;
  return `public:${id}`;
}

async function consumePublicQuota() {
  const now = Date.now();
  const clientId = await getPublicClientId();
  const existing = publicUsage.get(clientId);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: getResetAt(now) }
    : existing;

  if (bucket.count >= PUBLIC_MAX_MESSAGES_PER_DAY) {
    return {
      allowed: false as const,
      limit: PUBLIC_MAX_MESSAGES_PER_DAY,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  publicUsage.set(clientId, bucket);
  return {
    allowed: true as const,
    remaining: Math.max(0, PUBLIC_MAX_MESSAGES_PER_DAY - bucket.count),
    limit: PUBLIC_MAX_MESSAGES_PER_DAY,
    resetAt: bucket.resetAt,
  };
}

function compactToolResult(result: unknown): string {
  const raw = JSON.stringify(result);
  if (raw.length <= MAX_TOOL_RESULT_CHARS) return raw;

  return JSON.stringify({
    truncated: true,
    message: "Resultado recortado para evitar exceder contexto.",
    preview: raw.slice(0, MAX_TOOL_RESULT_CHARS),
  });
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { ownerId: string | null },
): Promise<unknown> {
  if (name === "docs_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { error: "query requerido" };
    const rawLimit = typeof args.limit === "number" ? args.limit : 5;
    const safeLimit = Math.min(Math.max(1, rawLimit), 5);
    return docsSearch(
      query,
      typeof args.categoria === "string" ? args.categoria : undefined,
      safeLimit,
    );
  }

  if (name === "docs_get_detail") {
    const id = typeof args.id === "number" ? args.id : parseInt(String(args.id), 10);
    if (!id || isNaN(id)) return { error: "id requerido" };
    const doc = await docsGetDetail(id, MAX_DOC_CHARS);
    if (!doc) return { error: `Documento con id=${id} no encontrado` };
    return {
      id: doc.id,
      titulo: doc.titulo,
      categoria: doc.categoria,
      tags: doc.tags,
      resumen: doc.resumen,
      contenido: doc.contenido,
      contenido_len: doc.contenido_len,
      contenido_truncado: doc.contenido_truncado,
      created_at: doc.created_at,
    };
  }

  if (name === "docs_list_categorias") {
    return docsListCategorias();
  }

  if (name === "catprod_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { error: "query requerido" };
    const rawLimit = typeof args.limit === "number" ? args.limit : 20;
    const safeLimit = Math.min(Math.max(1, rawLimit), 30);
    const results = await catprodSearch(query, safeLimit);
    if (!results.length) return { message: "No se encontraron claves SAT para esa búsqueda. Intenta con términos más generales." };
    return results;
  }

  if (name === "cedulas_search") {
    if (!ctx.ownerId) {
      return { error: "Inicia sesión para consultar tus cédulas fiscales." };
    }
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { error: "query requerido" };
    const rawLimit = typeof args.limit === "number" ? args.limit : 5;
    const safeLimit = Math.min(Math.max(1, rawLimit), 10);
    const results = await cedulasSearch(ctx.ownerId, query, safeLimit);
    if (!results.length) {
      return { message: "No se encontraron cédulas fiscales del usuario que coincidan." };
    }
    return results;
  }

  if (name === "create_excel") {
    return createExcelFromRows(args);
  }

  return { error: `Tool no soportada: ${name}` };
}

function hasUsefulToolData(name: string, result: unknown): boolean {
  if (Array.isArray(result)) return result.length > 0;
  if (!result || typeof result !== "object") return false;

  const row = result as Record<string, unknown>;
  if (typeof row.error === "string") return false;

  if (name === "docs_get_detail") {
    return typeof row.contenido === "string" && row.contenido.trim().length > 0;
  }

  if (name === "catprod_search") {
    return !row.message;
  }

  if (name === "cedulas_search") {
    return !row.message;
  }

  if (name === "create_excel") {
    return typeof row.download_url === "string" && row.download_url.length > 0;
  }

  // Tener solo categorias no garantiza que haya contenido relevante para responder.
  if (name === "docs_list_categorias") {
    return false;
  }

  return Object.keys(row).length > 0;
}

function shouldForceDirectFallback(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const noDataSignals = [
    "no he encontrado información",
    "no encontré información",
    "no encontre información",
    "no encontre informacion",
    "no se encontró información",
    "no se encontro informacion",
    "no hay información",
    "no hay informacion",
    "en los documentos disponibles",
    "consulta directamente",
    "fuentes oficiales del sat",
  ];

  return noDataSignals.some((signal) => normalized.includes(signal));
}

async function generateDirectFallbackAnswer(
  validMessages: ChatCompletionMessageParam[],
  model: string,
): Promise<string> {
  const fallback = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: FALLBACK_SYSTEM_PROMPT },
      ...validMessages,
    ],
  });

  return (
    fallback.choices[0]?.message?.content?.toString() ??
    "Puedo ayudarte con una guia general sobre ese tema aunque no tenga una fuente documental interna específica."
  );
}

// ─── POST /api/chat-docs ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getSession();
  const isPublicRequest = !session;

  let body: { messages?: unknown[]; rfc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages))
    return NextResponse.json({ error: "messages requerido" }, { status: 400 });

  const requestedRfc =
    typeof body.rfc === "string" && /^[A-Za-z0-9&Ññ]{10,13}$/.test(body.rfc.trim())
      ? body.rfc.trim().toUpperCase()
      : null;

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

  if (isPublicRequest) {
    const quotaResult = await consumePublicQuota();
    if (!quotaResult.allowed) {
      return NextResponse.json(
        {
          error: "Has alcanzado el limite diario del modo publico. Inicia sesion para continuar en modo premium.",
          code: "PUBLIC_LIMIT_REACHED",
          limit: quotaResult.limit,
          resetAt: quotaResult.resetAt,
        },
        { status: 429 },
      );
    }
  }

  const reqId = `chatdocs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const validMessages = sanitizeChatMessages(messages, {
    maxHistory: isPublicRequest ? PUBLIC_MAX_HISTORY_MESSAGES : PREMIUM_MAX_HISTORY_MESSAGES,
    maxChars: isPublicRequest ? PUBLIC_MAX_MESSAGE_CHARS : PREMIUM_MAX_MESSAGE_CHARS,
  });
  const lastUser = [...validMessages].reverse().find((m) => m.role === "user");

  console.log(`[chat-docs][${reqId}] start msgs=${validMessages.length}`);
  if (lastUser) {
    const preview = String(lastUser.content).replace(/\s+/g, " ").slice(0, 220);
    console.log(`[chat-docs][${reqId}] user="${preview}${preview.length >= 220 ? "..." : ""}"`);
  }

  try {
    const selectedModel = isPublicRequest ? PUBLIC_MODEL : PREMIUM_MODEL;
    const ownerId = session ? session.ownerId ?? session.sub : null;
    const toolCtx = { ownerId };
    const convo: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    let cedulaContextNote: string | null = null;
    if (requestedRfc && ownerId) {
      try {
        const cedulas = await cedulasSearch(ownerId, requestedRfc, 1);
        const cedula = cedulas.find((c) => c.rfc.toUpperCase() === requestedRfc) ?? cedulas[0];
        if (cedula) {
          const ctx = JSON.stringify(cedula, null, 2);
          convo.push({
            role: "system",
            content:
              `RFC seleccionado por el usuario: ${requestedRfc}\n\n` +
              `Datos de su CÉDULA DE IDENTIFICACIÓN FISCAL (registrada en el sistema):\n` +
              `${ctx}\n\n` +
              `Cuando el usuario pregunte por "mi RFC", "mi cédula", "mi domicilio", "mi régimen", "mis obligaciones", ` +
              `"mis actividades económicas", "mi CURP", "mi situación fiscal", etc., usa estos datos como fuente principal. ` +
              `No necesitas llamar cedulas_search para este RFC; ya tienes la información aquí. ` +
              `Cita el RFC en tu respuesta.`,
          });
          cedulaContextNote = `cedula_attached rfc=${requestedRfc}`;
        } else {
          convo.push({
            role: "system",
            content:
              `El usuario seleccionó el RFC ${requestedRfc} pero aún no ha subido la cédula fiscal de ese RFC. ` +
              `Si pregunta por datos específicos de su cédula (domicilio, régimen, obligaciones, etc.), indícale ` +
              `que primero suba la cédula fiscal desde el botón "Subir cédula fiscal" del Asistente Documental.`,
          });
          cedulaContextNote = `cedula_missing rfc=${requestedRfc}`;
        }
      } catch (err) {
        console.error(`[chat-docs][${reqId}] cedula_lookup_error:`, (err as Error).message);
      }
    }

    convo.push(...validMessages);
    let hasRelevantToolData = false;
    if (cedulaContextNote) {
      console.log(`[chat-docs][${reqId}] ${cedulaContextNote}`);
      // Si ya tenemos cédula adjunta, el modelo no necesita herramientas para tener datos útiles
      hasRelevantToolData = cedulaContextNote.startsWith("cedula_attached");
    }

    for (let step = 0; step < 5; step++) {
      const t0 = Date.now();
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        temperature: 0.2,
        messages: convo,
        tools: CHAT_TOOLS as any,
        tool_choice: "auto",
      });
      console.log(`[chat-docs][${reqId}] llm_step=${step + 1} ms=${Date.now() - t0}`);

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        let finalText = (
          msg.content ?? "No encontré información suficiente para responder."
        ).toString();

        if (!hasRelevantToolData || shouldForceDirectFallback(finalText)) {
          console.log(`[chat-docs][${reqId}] fallback_to_direct_model=true`);
          finalText = await generateDirectFallbackAnswer(validMessages, selectedModel);
        }

        console.log(`[chat-docs][${reqId}] final chars=${finalText.length}`);
        return new Response(finalText, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
          },
        });
      }

      convo.push(msg);

      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;

        const args = parseToolArgs(tc.function.arguments ?? "{}");
        console.log(`[chat-docs][${reqId}] tool_call name=${tc.function.name} args=${JSON.stringify(args)}`);
        const tTool = Date.now();
        let result: unknown;
        try {
          result = await executeTool(tc.function.name, args, toolCtx);
          if (hasUsefulToolData(tc.function.name, result)) {
            hasRelevantToolData = true;
          }
          console.log(
            `[chat-docs][${reqId}] tool_done name=${tc.function.name} ms=${Date.now() - tTool} rows=${Array.isArray(result) ? result.length : "n/a"}`,
          );
        } catch (toolErr) {
          const msgErr = (toolErr as Error).message;
          console.error(
            `[chat-docs][${reqId}] tool_error name=${tc.function.name} ms=${Date.now() - tTool} err=${msgErr}`,
          );
          result = {
            error: "TOOL_EXECUTION_ERROR",
            tool: tc.function.name,
            message: msgErr,
          };
        }

        convo.push({
          role: "tool",
          tool_call_id: tc.id,
          content: compactToolResult(result),
        });
      }
    }

    console.log(`[chat-docs][${reqId}] max_steps_reached`);
    const fallbackText = await generateDirectFallbackAnswer(validMessages, selectedModel);
    return new Response(fallbackText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error(`[chat-docs][${reqId}] Error:`, (err as Error).message);
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
