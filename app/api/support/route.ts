import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { sendSupportEmail } from "@/lib/email";

const imageSchema = z.object({
  name:     z.string().max(200),
  data:     z.string().max(3_000_000), // base64 ~2 MB raw
  mimeType: z.string().max(50),
});

const supportSchema = z.object({
  subject: z.string().trim().min(3, "El asunto es demasiado corto").max(160, "El asunto es demasiado largo"),
  message: z.string().trim().min(10, "El mensaje es demasiado corto").max(4000, "El mensaje no puede exceder 4000 caracteres"),
  images:  z.array(imageSchema).max(3).optional().default([]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = supportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { subject, message, images } = parsed.data;

  // Guardar en BD
  try {
    const db = await getDb();
    await db
      .request()
      .input("user_id", session.sub)
      .input("subject", subject)
      .input("message", message)
      .query(`
        INSERT INTO support_tickets (user_id, subject, message)
        VALUES (@user_id, @subject, @message)
      `);
  } catch (err) {
    console.error("[support] Error al guardar ticket:", (err as Error).message);
    return NextResponse.json({ error: "Error al guardar el ticket. Intenta de nuevo." }, { status: 503 });
  }

  // Enviar correo (no bloqueante si falla)
  try {
    await sendSupportEmail({
      fromName: session.name,
      fromEmail: session.email,
      subject,
      message,
      images,
    });
  } catch (err) {
    console.error("[support] Error al enviar correo:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
