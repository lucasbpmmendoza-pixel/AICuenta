import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { signResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(req: NextRequest) {
  // ── 1. Validar body ────────────────────────────────────
  let email: string;
  try {
    ({ email } = schema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }

  // ── 2. Buscar usuario ──────────────────────────────────
  // Siempre respondemos igual para no revelar si el correo existe
  const ok = NextResponse.json(
    { ok: true, message: "Si ese correo existe, recibirás un enlace en breve." },
    { status: 200 },
  );

  let user: { id: string; name: string; email: string } | undefined;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("email", email)
      .query<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM users WHERE email = @email AND is_active = 1`,
      );
    user = result.recordset[0];
  } catch (err) {
    console.error("[forgot-password] DB error:", (err as Error).message);
    return ok; // No revelar error interno
  }

  if (!user) return ok;

  // ── 3. Generar token y enviar correo (fire-and-forget) ─
  const token = await signResetToken(user.id, user.email);
  sendPasswordResetEmail(user.email, user.name, token).catch((err) =>
    console.error("[forgot-password] Email error:", (err as Error).message),
  );

  return ok;
}
