import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import sql from "mssql";
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
    const msg = (err as Error).message;
    console.error("[register] reCAPTCHA error:", msg);
    if (msg.startsWith("RECAPTCHA_SERVER_MISCONFIG")) {
      return NextResponse.json({ error: "Servicio de seguridad no configurado correctamente." }, { status: 500 });
    }
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

  // ── 6-7. Crear usuario + enviar verificacion en transaccion ─
  // Evita cuentas creadas sin correo cuando en serverless el proceso termina rapido.
  let tx: sql.Transaction | null = null;
  try {
    tx = new sql.Transaction(db);
    await tx.begin();

    const result = await new sql.Request(tx)
      .input("name", name)
      .input("email", email)
      .input("password_hash", passwordHash)
      .query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, plan_type)
         OUTPUT INSERTED.id
         VALUES (@name, @email, @password_hash, 'basic')`,
      );

    const userId = result.recordset[0].id;
    const verificationToken = await signVerificationToken(userId, email);
    await sendVerificationEmail(email, name, verificationToken);

    await tx.commit();
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch (rollbackErr) {
        console.error("[register] Rollback error:", (rollbackErr as Error).message);
      }
    }

    const msg = (err as Error).message;
    console.error("[register] Create/send error:", msg);
    if (msg.includes("RESEND_API_KEY") || msg.includes("You can only send testing emails") || msg.includes("domain") || msg.includes("sender")) {
      return NextResponse.json(
        { error: "No se pudo enviar el correo de verificacion. Revisa la configuracion de correo en produccion." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Intenta mas tarde." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, message: "check_email" },
    { status: 201 },
  );
}
