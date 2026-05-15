import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getSession } from "@/lib/session";
import {
  countFacturasParaChat,
  fetchFacturasParaChat,
  CFDIForChat,
} from "@/lib/facturas-query";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Tipos de comprobante ─────────────────────────────────────────────────────
const TIPO_LABEL: Record<string, string> = {
  I: "Ingreso",
  E: "Egreso / Nota de crédito",
  N: "Nómina",
  P: "Complemento de pago",
};

// ─── Formateadores ────────────────────────────────────────────────────────────
const MXN = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);

const fmtDate = (d: Date | string) => {
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
};

// ─── Builder de contexto TON ──────────────────────────────────────────────────
function buildContext(
  cfdis: CFDIForChat[],
  rfc: string,
  dateFrom: string,
  dateTo: string,
): string {
  const lines: string[] = [
    "=== CONTEXTO FISCAL ===",
    `RFC: ${rfc}`,
    `Período: ${dateFrom} — ${dateTo}`,
    `CFDIs incluidos: ${cfdis.length}`,
    "",
  ];

  for (let i = 0; i < cfdis.length; i++) {
    const c = cfdis[i];
    const movimiento = c.rfcEmisor.toUpperCase() === rfc.toUpperCase() ? "INGRESO" : "EGRESO";
    lines.push(`━━━━ CFDI ${i + 1} ━━━━`);
    lines.push(`UUID: ${c.uuid}`);
    lines.push(
      `Tipo: ${c.tipoComprobante} (${TIPO_LABEL[c.tipoComprobante] ?? c.tipoComprobante}) | Movimiento: ${movimiento} | Status: ${c.status}`,
    );
    lines.push(`Emisor:   ${c.rfcEmisor} — ${c.razonSocialEmisor}`);
    lines.push(`Receptor: ${c.rfcReceptor} — ${c.razonSocialReceptor}`);
    lines.push(`Fecha: ${fmtDate(c.fecha)} | Serie/Folio: ${c.serie || "—"}/${c.folio || "—"}`);
    if (c.regimenFiscal)
      lines.push(`Régimen: ${c.regimenFiscal} | Lugar exp.: ${c.lugarExpedicion}`);
    lines.push(`Moneda: ${c.moneda} | TC: ${c.tipoCambio}`);
    if (c.metodoPago || c.formaPago)
      lines.push(`Método pago: ${c.metodoPago} | Forma pago: ${c.formaPago}`);
    if (c.usoCFDI) lines.push(`Uso CFDI: ${c.usoCFDI}`);

    lines.push("Importes:");
    lines.push(`  Subtotal        ${MXN(c.subtotal)}`);
    if (c.descuento > 0)   lines.push(`  Descuento       ${MXN(c.descuento)}`);
    if (c.totalIVA > 0)    lines.push(`  IVA Total       ${MXN(c.totalIVA)}`);
    if (c.totalIVA16 > 0)  lines.push(`  IVA 16%         ${MXN(c.totalIVA16)}`);
    if (c.totalIVA8 > 0)   lines.push(`  IVA 8%          ${MXN(c.totalIVA8)}`);
    if (c.totalISR > 0)    lines.push(`  ISR ret.        ${MXN(c.totalISR)}`);
    if (c.totalIVARet > 0) lines.push(`  IVA ret.        ${MXN(c.totalIVARet)}`);
    lines.push(`  TOTAL           ${MXN(c.total)}`);

    if (c.conceptos.length > 0) {
      lines.push(`Conceptos (${c.conceptos.length}):`);
      c.conceptos.forEach((co, j) => {
        lines.push(
          `  ${j + 1}. [${co.claveProdServ || "?"}] ${co.descripcion}` +
            ` — Cant: ${co.cantidad}` +
            ` — Importe: ${MXN(co.importe)}` +
            (co.descuento > 0 ? ` — Descuento: ${MXN(co.descuento)}` : ""),
        );
      });
    }

    if (c.pagos.length > 0) {
      lines.push(`Pagos (${c.pagos.length}):`);
      c.pagos.forEach((p) => {
        lines.push(
          `  • ${p.fechaPago} | Forma: ${p.formaPago} | ${p.moneda} TC:${p.tipoCambio} | ${MXN(p.monto)}`,
        );
      });
    }

    lines.push("");
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `Eres un asistente fiscal y contable especializado en México (SAT, CFDI, ISR, IVA).
Tienes cargado el contexto de los CFDIs del cliente para el período seleccionado.
Tu objetivo: ayudar a entender, analizar y tomar decisiones sobre sus facturas.

REGLA FUNDAMENTAL — Clasificación de CFDIs:
Cada CFDI en el contexto incluye el campo "Movimiento" que ya está calculado para el RFC del cliente:
- Movimiento: INGRESO → el cliente es el EMISOR (él expidió la factura, recibe dinero).
- Movimiento: EGRESO  → el cliente es el RECEPTOR (le facturaron a él, paga dinero).
Cuando el usuario pregunte por "ingresos" o "lo que facturé/vendí/cobré", suma ÚNICAMENTE los CFDIs con Movimiento: INGRESO.
Cuando pregunte por "egresos", "gastos", "lo que me facturaron/compré/pagué", suma ÚNICAMENTE los CFDIs con Movimiento: EGRESO.
Nunca mezcles INGRESO y EGRESO al calcular totales de una sola categoría.

Instrucciones:
- Responde siempre en español, de manera clara y profesional.
- Usa los datos del contexto para responder preguntas sobre facturas, montos, clientes, proveedores, impuestos.
- Si el usuario pregunta algo que no está en el contexto, indícalo claramente.
- Puedes hacer cálculos, totalizaciones y comparativas con los datos disponibles.
- Usa formato legible: listas, montos en pesos MXN con símbolo $.
- Nunca inventes datos que no estén en el contexto.`;

// ─── GET /api/chat — conteo de CFDIs para el período ─────────────────────────
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc      = searchParams.get("rfc")?.trim().toUpperCase();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");

  if (!rfc || !dateFrom || !dateTo)
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  try {
    const count = await countFacturasParaChat(rfc, new Date(dateFrom), new Date(dateTo));
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[chat/count]", (err as Error).message);
    return NextResponse.json({ error: "Error al contar CFDIs" }, { status: 500 });
  }
}

// ─── POST /api/chat — streaming response ─────────────────────────────────────
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Max 7 días por petición
  const diffDays = (dto.getTime() - dfrom.getTime()) / 86_400_000;
  if (diffDays > 8)
    return NextResponse.json({ error: "El rango máximo es 7 días" }, { status: 400 });

  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });

  try {
    const cfdis   = await fetchFacturasParaChat(rfc, dfrom, dto);
    const context = buildContext(cfdis, rfc, dateFrom, dateTo);

    console.log("\n========== TON CONTEXT ==========");
    console.log(`CFDIs cargados: ${cfdis.length}`);
    console.log(context);
    console.log("=================================\n");

    const validMessages = (messages as { role: string; content: string }[])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) as ChatCompletionMessageParam[];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      temperature: 0.3,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` },
        ...validMessages,
      ],
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content ?? "";
              if (text) controller.enqueue(enc.encode(text));
            }
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-store",
          "X-Accel-Buffering": "no",
        },
      },
    );
  } catch (err) {
    console.error("[chat] Error:", (err as Error).message);
    return NextResponse.json({ error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
