import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";
import { createChatExport } from "@/lib/chat-docs-export-store";
import { loadFiscalContext, saveFiscalContext, type ContextMessage } from "@/lib/chat-fiscal-context";
import {
  chatConciliarPagosRelacionados,
  chatAggregateCFDIs,
  chatGetCFDIDetail,
  chatSearchCFDIs,
  chatGetConceptosAnalysis,
  chatGetTopFacturas,
  chatGetResumenFiscal,
  chatGetIvaDesglose,
  chatGetNomina,
  chatGetFlujoEfectivo,
  chatGetFacturasCanceladas,
} from "@/lib/facturas-query";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente fiscal y contable especializado en México (SAT, CFDI, ISR, IVA).
Tu trabajo es responder con datos reales obtenidos mediante tools SQL, nunca con supuestos.

Reglas obligatorias:
- Antes de responder preguntas numéricas, de conteos o comparativas, usa tools.
- Si el usuario pide "top facturas", "facturas más grandes", "facturas de mayor importe", usa chat_get_top_facturas.
- Si el usuario pide detalle de una factura, usa chat_get_cfdi_detail.
- Si el usuario pide listados o filtros, usa chat_search_cfdis.
- Si pide totales, top o comparativos, usa chat_aggregate_cfdis.
- Si el usuario pide "ingreso total" o "egreso total", usa chat_aggregate_cfdis con groupBy="none" y movimiento correcto (INGRESO o EGRESO).
- Para preguntas sobre "proveedores", "clientes", "quién me emitió facturas", "mis compradores", "mis vendedores", desglose por proveedor/cliente, usa chat_get_conceptos_analysis con groupBy="supplier" y movimiento=EGRESO (proveedores) o INGRESO (clientes).
- Para preguntas sobre conceptos, gastos principales, desglose de items o gastos por tipo de producto, usa chat_get_conceptos_analysis con groupBy="clave" o "descripcion".
- No calcules totales sumando resultados de chat_search_cfdis.
- Si pide conciliación de complementos de pago tipo P o diferencias entre imp_pagado y monto_total_pagos, usa chat_conciliar_pagos.
- Si el usuario pide un resumen general, resumen fiscal, situación del periodo o panorama general, usa chat_resumen_fiscal.
- Para preguntas sobre IVA (IVA a pagar, IVA a favor, IVA trasladado, IVA acreditable, desglose por tasa), usa chat_get_iva_desglose.
- Para preguntas sobre nómina, sueldos, empleados, ISR de nómina, usa chat_get_nomina.
- Para preguntas sobre flujo de efectivo real, cuánto cobré/pagué efectivamente, complementos de pago por forma de pago, usa chat_get_flujo_efectivo.
- Para preguntas sobre facturas canceladas, cancelaciones del periodo, usa chat_get_facturas_canceladas.
- Si el usuario pide generar o descargar Excel, usa create_excel con columnas y filas estructuradas.
- Nunca inventes valores; si no hay datos, dilo explícitamente.
- Responde siempre en español claro y profesional.
- Mantén la clasificación: INGRESO = RFC cliente como emisor, EGRESO = RFC cliente como receptor.
- "Proveedores" = quienes te emiten facturas (EGRESO, grupBy=supplier)
- "Clientes" = quienes tu les emites facturas (INGRESO, groupBy=supplier)`;

const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "chat_search_cfdis",
      description: "Busca CFDIs por filtros y devuelve filas resumidas.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO"] },
          tipoComprobante: { type: "string", enum: ["I", "E", "N", "P"] },
          searchText: { type: "string", description: "Texto libre para UUID, RFC o razón social" },
          limit: { type: "number", description: "Máximo de filas (1-200)", default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_aggregate_cfdis",
      description: "Agrega CFDIs por grupo para obtener totales y comparativos.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
          tipoComprobante: { type: "string", enum: ["I", "E", "N", "P"] },
          groupBy: {
            type: "string",
            enum: ["none", "mes", "rfcEmisor", "rfcReceptor", "razonSocialEmisor", "razonSocialReceptor", "tipoComprobante"],
            default: "none",
          },
          top: { type: "number", description: "Máximo de grupos (1-100)", default: 25 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_cfdi_detail",
      description: "Obtiene detalle completo de un CFDI por UUID, incluyendo conceptos, pagos y docs relacionados.",
      parameters: {
        type: "object",
        properties: {
          uuid: { type: "string", description: "UUID exacto de la factura" },
        },
        required: ["uuid"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_conciliar_pagos",
      description: "Concilia complementos de pago (tipo P) contra sus documentos relacionados y detecta diferencias.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Máximo de pagos a revisar (1-300)", default: 100 },
          onlyWithDifferences: { type: "boolean", description: "Si true, devuelve solo pagos con diferencia", default: false },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_conceptos_analysis",
      description: "Analiza conceptos de facturas agrupados por producto, descripción o proveedor para desglose de gastos e ingresos.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
          tipoComprobante: { type: "string", enum: ["I", "E", "N", "P"] },
          groupBy: {
            type: "string",
            enum: ["none", "clave", "supplier", "descripcion"],
            default: "clave",
            description: "Agrupar por: clave (ClaveProductoServicio), supplier (proveedor/cliente), descripcion (nombre del item), none (total general)",
          },
          limit: { type: "number", description: "Máximo de grupos (1-200)", default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_top_facturas",
      description: "Obtiene las facturas individuales de mayor importe, ordenadas de forma descendente.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
          tipoComprobante: { type: "string", enum: ["I", "E", "N", "P"] },
          limit: { type: "number", description: "Máximo de facturas (1-200)", default: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_resumen_fiscal",
      description: "Devuelve un resumen fiscal completo del periodo: totales de ingresos, egresos, nómina, notas de crédito, complementos de pago y canceladas. Usar para preguntas como 'dame un resumen', 'cuál es mi situación fiscal', 'resumen del periodo'.",
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
      name: "chat_get_iva_desglose",
      description: "Desglosa el IVA por tasa (16%, 8%, 0%, exento) para ingresos y egresos, calcula IVA trasladado, acreditable y neto a pagar. Usar para preguntas sobre IVA, declaración de IVA, IVA a favor/a cargo.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_nomina",
      description: "Analiza los CFDIs de nómina (tipo N) agrupados por empleado o patrón. Usar para preguntas sobre nómina, sueldos, ISR retenido en nómina, empleados.",
      parameters: {
        type: "object",
        properties: {
          direccion: {
            type: "string",
            enum: ["EMITIDA", "RECIBIDA", "AMBAS"],
            default: "AMBAS",
            description: "EMITIDA = nóminas que el RFC emite (patrón), RECIBIDA = nóminas que el RFC recibe (empleado)",
          },
          limit: { type: "number", description: "Máximo de registros (1-200)", default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_flujo_efectivo",
      description: "Calcula el flujo de efectivo real: montos efectivamente cobrados/pagados a partir de complementos de pago (tipo P) y facturas PUE. Usar para preguntas sobre flujo de caja, cuánto cobré/pagué realmente, efectivo del periodo.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
          groupBy: {
            type: "string",
            enum: ["none", "mes", "formaPago"],
            default: "none",
            description: "Agrupar resultados por: none (total), mes, formaPago (efectivo, transferencia, etc.)",
          },
          limit: { type: "number", description: "Máximo de grupos (1-300)", default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chat_get_facturas_canceladas",
      description: "Lista y resume las facturas canceladas del periodo. Usar para preguntas sobre cancelaciones, facturas canceladas, cuánto se canceló.",
      parameters: {
        type: "object",
        properties: {
          movimiento: { type: "string", enum: ["INGRESO", "EGRESO", "AMBOS"], default: "AMBOS" },
          limit: { type: "number", description: "Máximo de facturas (1-200)", default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_excel",
      description:
        "Genera un archivo Excel (.xlsx) con los datos proporcionados. Usar cuando el usuario pida exportar o descargar resultados.",
      parameters: {
        type: "object",
        properties: {
          fileName: {
            type: "string",
            description: "Nombre del archivo, por ejemplo analisis_fiscal.xlsx",
          },
          sheetName: {
            type: "string",
            description: "Nombre de la hoja",
          },
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Lista de columnas en orden",
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: {
                anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
              },
            },
            description: "Arreglo de objetos que representan filas",
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

function normalizeExcelColumns(rawColumns: unknown, rows: Record<string, unknown>[]): string[] {
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

  const withFallback = normalized || `reporte_fiscal_${new Date().toISOString().slice(0, 10)}`;
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
      : "Analisis";
  const ws = workbook.addWorksheet(sheetName);

  ws.columns = columns.map((col) => ({
    header: col,
    key: col,
    width: Math.max(12, Math.min(42, col.length + 4)),
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
      fgColor: { argb: "FF4338CA" },
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
  const exported = createChatExport(buf, fileName, "/api/chat/export");

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

function sanitizeChatMessages(messages: unknown[]): ChatCompletionMessageParam[] {
  return (messages as { role?: unknown; content?: unknown }[])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));
}

function summarizeToolResult(result: unknown) {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  return {
    keys: Object.keys(r),
    rows: Array.isArray(r.rows) ? r.rows.length : undefined,
    count: typeof r.count === "number" ? r.count : undefined,
    hasHeader: !!r.header,
    resumenKeys: r.resumen && typeof r.resumen === "object" ? Object.keys(r.resumen as Record<string, unknown>) : undefined,
  };
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  rfc: string,
  dfrom: Date,
  dto: Date,
) {
  if (name === "chat_search_cfdis") {
    return chatSearchCFDIs(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | undefined,
      tipoComprobante: args.tipoComprobante as "I" | "E" | "N" | "P" | undefined,
      searchText: typeof args.searchText === "string" ? args.searchText : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "chat_aggregate_cfdis") {
    return chatAggregateCFDIs(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined,
      tipoComprobante: args.tipoComprobante as "I" | "E" | "N" | "P" | undefined,
      groupBy: args.groupBy as
        | "none"
        | "mes"
        | "rfcEmisor"
        | "rfcReceptor"
        | "razonSocialEmisor"
        | "razonSocialReceptor"
        | "tipoComprobante"
        | undefined,
      top: typeof args.top === "number" ? args.top : undefined,
    });
  }

  if (name === "chat_get_cfdi_detail") {
    const uuid = typeof args.uuid === "string" ? args.uuid.trim() : "";
    if (!uuid) return { error: "uuid requerido" };
    return chatGetCFDIDetail(rfc, dfrom, dto, uuid);
  }

  if (name === "chat_conciliar_pagos") {
    return chatConciliarPagosRelacionados(rfc, dfrom, dto, {
      limit: typeof args.limit === "number" ? args.limit : undefined,
      onlyWithDifferences: typeof args.onlyWithDifferences === "boolean" ? args.onlyWithDifferences : undefined,
    });
  }

  if (name === "chat_get_conceptos_analysis") {
    return chatGetConceptosAnalysis(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined,
      tipoComprobante: args.tipoComprobante as "I" | "E" | "N" | "P" | undefined,
      groupBy: args.groupBy as "none" | "clave" | "supplier" | "descripcion" | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "chat_get_top_facturas") {
    return chatGetTopFacturas(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined,
      tipoComprobante: args.tipoComprobante as "I" | "E" | "N" | "P" | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "chat_resumen_fiscal") {
    return chatGetResumenFiscal(rfc, dfrom, dto);
  }

  if (name === "chat_get_iva_desglose") {
    return chatGetIvaDesglose(rfc, dfrom, dto, args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined);
  }

  if (name === "chat_get_nomina") {
    return chatGetNomina(rfc, dfrom, dto, {
      direccion: args.direccion as "EMITIDA" | "RECIBIDA" | "AMBAS" | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "chat_get_flujo_efectivo") {
    return chatGetFlujoEfectivo(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined,
      groupBy: args.groupBy as "none" | "mes" | "formaPago" | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "chat_get_facturas_canceladas") {
    return chatGetFacturasCanceladas(rfc, dfrom, dto, {
      movimiento: args.movimiento as "INGRESO" | "EGRESO" | "AMBOS" | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }

  if (name === "create_excel") {
    return createExcelFromRows(args);
  }

  return { error: `Tool no soportada: ${name}` };
}

// ─── POST /api/chat — streaming response ─────────────────────────────────────
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.isDemo) {
    return NextResponse.json(
      { error: "En modo demo no puedes enviar mensajes a FinDoc. Crea una cuenta para chatear con el asistente." },
      { status: 403 },
    );
  }
  if (await isFreemiumOwner(session)) {
    return NextResponse.json({ error: FREEMIUM_FORBIDDEN_MESSAGE }, { status: 403 });
  }

  let body: { rfc?: string; dateFrom?: string; dateTo?: string; messages?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { rfc, dateFrom, dateTo, messages } = body;

  if (!rfc || !dateFrom || !dateTo || !Array.isArray(messages))
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  const dfrom = new Date(dateFrom);
  const dto   = new Date(dateTo);
  if (isNaN(dfrom.getTime()) || isNaN(dto.getTime()))
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

  try {
    const reqId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ── Contexto persistido en BD (últimos 5 mensajes) ────────────────────────
    const savedContext = await loadFiscalContext(session.sub, rfc);

    // Tomar solo el último mensaje de usuario enviado por el cliente
    const incomingMessages = sanitizeChatMessages(messages);
    const newUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");

    // Construir historial efectivo: contexto BD + nuevo mensaje del usuario
    const effectiveHistory: ContextMessage[] = [
      ...savedContext,
      ...(newUserMsg ? [{ role: "user" as const, content: String(newUserMsg.content) }] : []),
    ].slice(-5);

    const lastUser = effectiveHistory.slice().reverse().find((m) => m.role === "user");

    console.log(`[chat][${reqId}] start rfc=${rfc} dateFrom=${dateFrom} dateTo=${dateTo} savedCtx=${savedContext.length} effectiveHistory=${effectiveHistory.length}`);
    if (lastUser) {
      const preview = String(lastUser.content).replace(/\s+/g, " ").slice(0, 220);
      console.log(`[chat][${reqId}] user="${preview}${preview.length >= 220 ? "..." : ""}"`);
    }

    const convo: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Contexto fijo de sesión: RFC=${rfc}, periodo=${dateFrom}..${dateTo}. Nunca consultes fuera de este RFC/período.`,
      },
      ...effectiveHistory,
    ];

    for (let step = 0; step < 4; step++) {
      const t0 = Date.now();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: convo,
        tools: CHAT_TOOLS as any,
        tool_choice: "auto",
      });
      console.log(`[chat][${reqId}] llm_step=${step + 1} ms=${Date.now() - t0}`);

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const finalText = (msg.content ?? "No encontré información suficiente para responder.").toString();
        console.log(`[chat][${reqId}] final_without_tools chars=${finalText.length}`);

        // Guardar contexto actualizado en BD (fire-and-forget)
        const updatedContext: ContextMessage[] = [
          ...effectiveHistory,
          { role: "assistant", content: finalText },
        ];
        saveFiscalContext(session.sub, rfc, updatedContext).catch(() => {});

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
        console.log(`[chat][${reqId}] tool_call name=${tc.function.name} args=${JSON.stringify(args)}`);
        const tTool = Date.now();
        let result: unknown;
        try {
          result = await executeTool(tc.function.name, args, rfc, dfrom, dto);
          console.log(
            `[chat][${reqId}] tool_done name=${tc.function.name} ms=${Date.now() - tTool} summary=${JSON.stringify(summarizeToolResult(result))}`,
          );
        } catch (toolErr) {
          const msgErr = (toolErr as Error).message;
          console.error(`[chat][${reqId}] tool_error name=${tc.function.name} ms=${Date.now() - tTool} err=${msgErr}`);
          result = {
            error: "TOOL_EXECUTION_ERROR",
            tool: tc.function.name,
            message: msgErr,
          };
        }

        convo.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    console.log(`[chat][${reqId}] max_steps_reached`);
    const maxStepsText = "No pude completar la consulta en este momento.";
    saveFiscalContext(session.sub, rfc, [
      ...effectiveHistory,
      { role: "assistant", content: maxStepsText },
    ]).catch(() => {});
    return new Response(maxStepsText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[chat] Error:", (err as Error).message);
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
