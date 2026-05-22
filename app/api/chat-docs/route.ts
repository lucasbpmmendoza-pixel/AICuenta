import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getSession } from "@/lib/session";
import { docsSearch, docsGetDetail, docsListCategorias } from "@/lib/docs-query";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1500;
const MAX_DOC_CHARS = 8000;
const MAX_TOOL_RESULT_CHARS = 12000;

const SYSTEM_PROMPT = `Eres un asistente experto en consulta de documentos internos.
Tu trabajo es responder preguntas usando únicamente la información de los documentos disponibles en la base de datos.

Reglas obligatorias:
- Antes de responder cualquier pregunta, usa docs_search para encontrar documentos relevantes.
- Si el resultado de docs_search no tiene suficiente detalle, usa docs_get_detail para obtener el contenido completo del documento.
- Si necesitas saber qué categorías existen, usa docs_list_categorias.
- Nunca inventes información; si no encuentras datos relevantes en los documentos, dilo explícitamente.
- Cita el título del documento fuente cuando respondas.
- Responde siempre en español claro y profesional.
- Si el usuario pregunta algo que no está cubierto por los documentos disponibles, indícalo con claridad.`;

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
];

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sanitizeChatMessages(messages: unknown[]): ChatCompletionMessageParam[] {
  return (messages as { role?: unknown; content?: unknown }[])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
    }));
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

  return { error: `Tool no soportada: ${name}` };
}

// ─── POST /api/chat-docs ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { messages?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages))
    return NextResponse.json({ error: "messages requerido" }, { status: 400 });

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

  const reqId = `chatdocs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const validMessages = sanitizeChatMessages(messages);
  const lastUser = [...validMessages].reverse().find((m) => m.role === "user");

  console.log(`[chat-docs][${reqId}] start msgs=${validMessages.length}`);
  if (lastUser) {
    const preview = String(lastUser.content).replace(/\s+/g, " ").slice(0, 220);
    console.log(`[chat-docs][${reqId}] user="${preview}${preview.length >= 220 ? "..." : ""}"`);
  }

  try {
    const convo: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...validMessages,
    ];

    for (let step = 0; step < 5; step++) {
      const t0 = Date.now();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
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
        const finalText = (
          msg.content ?? "No encontré información suficiente para responder."
        ).toString();
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
          result = await executeTool(tc.function.name, args);
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
    return new Response("No pude completar la consulta en este momento.", {
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
