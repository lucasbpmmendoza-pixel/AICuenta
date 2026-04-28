import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validations";
import { getDb } from "@/lib/db";
import { signVerificationToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { verifyRecaptcha } from "@/lib/recaptcha";

const BCRYPT_ROUNDS = 12;

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la solicitud invalido" },
      { status: 400 },
    );
  }

  // ── 2. Verificar reCAPTCHA ────────────────────────
  const recaptchaToken = (body as Record<string, unknown>)?.recaptchaToken;
  if (typeof recaptchaToken !== "string" || !recaptchaToken) {
    return NextResponse.json({ error: "Verificacion de seguridad requerida." }, { status: 400 });
  }
  try {
    await verifyRecaptcha(recaptchaToken, "register");
  } catch (err) {
    console.error("[register] reCAPTCHA error:", (err as Error).message);
    return NextResponse.json({ error: "Verificacion de seguridad fallida. Intenta de nuevo." }, { status: 400 });
  }

  // ── 3. Validar con Zod ─────────────────────────────
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstError.message, field: firstError.path[0] },
      { status: 422 },
    );
  }

  const { name, email, password } = parsed.data;

  // ── 4. Conectar a Azure SQL ────────────────────────
  let db;
  try {
    db = await getDb();
  } catch {
    console.error("[register] DB connection error");
    return NextResponse.json(
      { error: "Error de conexion. Intenta mas tarde." },
      { status: 503 },
    );
  }

  // ── 4. Verificar duplicado de email ──────────────────
  try {
    const existing = await db
      .request()
      .input("email", email)
      .query<{ email: string }>(
        `SELECT email FROM users WHERE email = @email`,
      );

    if (existing.recordset.length > 0) {
      return NextResponse.json(
        { error: "Este correo ya esta registrado", field: "email" },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[register] Duplicate check error:", (err as Error).message);
    return NextResponse.json(
      { error: "Error al verificar datos. Intenta mas tarde." },
      { status: 503 },
    );
  }

  // ── 5. Hash de contrasena ──────────────────────────────
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // ── 6. Insertar usuario ────────────────────────────────
  let userId: string;
  try {
    const result = await db
      .request()
      .input("name", name)
      .input("email", email)
      .input("password_hash", passwordHash)
      .query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash)
         OUTPUT INSERTED.id
         VALUES (@name, @email, @password_hash)`,
      );

    userId = result.recordset[0].id;
  } catch (err) {
    console.error("[register] Insert error:", (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Intenta mas tarde." },
      { status: 500 },
    );
  }

  // ── 7. Generar token de verificación y enviar correo ──────
  const verificationToken = await signVerificationToken(userId, email);
  sendVerificationEmail(email, name, verificationToken).catch((err) =>
    console.error("[register] Verification email error:", (err as Error).message),
  );

  return NextResponse.json(
    { ok: true, message: "check_email" },
    { status: 201 },
  );
}
