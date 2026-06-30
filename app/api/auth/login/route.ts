import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { signToken, setAuthCookie } from "@/lib/auth";
import { getPostLoginRedirect } from "@/lib/redirect";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { DEMO_COOKIE_NAME } from "@/lib/demo-mode";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export async function POST(req: NextRequest) {
  // ── 1. Parse + validar ─────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  // ── 2. Verificar reCAPTCHA ────────────────────────
  const recaptchaToken = (body as Record<string, unknown>)?.recaptchaToken;
  if (typeof recaptchaToken !== "string" || !recaptchaToken) {
    return NextResponse.json({ error: "Verificación de seguridad requerida." }, { status: 400 });
  }
  try {
    await verifyRecaptcha(recaptchaToken, "login");
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[login] reCAPTCHA error:", msg);
    if (msg.startsWith("RECAPTCHA_SERVER_MISCONFIG")) {
      return NextResponse.json({ error: "Servicio de seguridad no configurado correctamente." }, { status: 500 });
    }
    return NextResponse.json({ error: "Verificación de seguridad fallida. Intenta de nuevo." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  const { email, password } = parsed.data;

  // ── 2. Buscar usuario ──────────────────────────────────
  let db;
  try {
    db = await getDb();
  } catch {
    return NextResponse.json(
      { error: "Error de conexión. Intenta más tarde." },
      { status: 503 },
    );
  }

  let user: { id: string; name: string; email: string; password_hash: string; is_active: boolean; email_verified: boolean; role: string; owner_id: string | null } | undefined;
  try {
    const result = await db
      .request()
      .input("email", email)
      .query<{ id: string; name: string; email: string; password_hash: string; is_active: boolean; email_verified: boolean; role: string; owner_id: string | null }>(
        `SELECT id, name, email, password_hash, is_active, email_verified, role, owner_id
         FROM users
         WHERE email = @email`,
      );
    user = result.recordset[0];
  } catch (err) {
    console.error("[login] Query error:", (err as Error).message);
    return NextResponse.json(
      { error: "Error al iniciar sesión. Intenta más tarde." },
      { status: 503 },
    );
  }

  // ── 3. Verificar existencia + cuenta activa ────────────
  // Mismo mensaje para usuario no encontrado y contrasena incorrecta
  // para no revelar si el correo existe
  if (!user || !user.is_active) {
    await bcrypt.compare("dummy", "$2b$12$dummyhashtopreventtimingattacks123456789012");
    return NextResponse.json(
      { error: "Credenciales incorrectas" },
      { status: 401 },
    );
  }

  // ── 4. Verificar contrasena ────────────────────────────
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: "Credenciales incorrectas" },
      { status: 401 },
    );
  }

  // ── 5. Verificar que el correo esté confirmado ─────────
  if (!user.email_verified) {
    return NextResponse.json(
      { error: "Debes verificar tu correo antes de iniciar sesión.", code: "email_not_verified" },
      { status: 403 },
    );
  }

  // ── 6. Firmar JWT y setear cookie ──────────────────────
  const role = (user.role ?? 'owner') as 'owner' | 'member' | 'chikenelo';
  const token = await signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role,
    ...(user.owner_id ? { ownerId: user.owner_id } : {}),
  });
  await setAuthCookie(token);

  // Members y chikenelo siempre van al dashboard (no necesitan configurar EFIEL)
  const redirectTo = (role === 'member' || role === 'chikenelo')
    ? '/dashboard'
    : await getPostLoginRedirect(user.id);
  const res = NextResponse.json({ ok: true, redirectTo });
  res.cookies.delete(DEMO_COOKIE_NAME);
  return res;
}
