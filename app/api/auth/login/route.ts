import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { signToken, setAuthCookie } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(1, "Contrasena requerida"),
});

export async function POST(req: NextRequest) {
  // ── 1. Parse + validar ─────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
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
      { error: "Error de conexion. Intenta mas tarde." },
      { status: 503 },
    );
  }

  let user: { id: string; name: string; email: string; password_hash: string; is_active: boolean } | undefined;
  try {
    const result = await db
      .request()
      .input("email", email)
      .query<{ id: string; name: string; email: string; password_hash: string; is_active: boolean }>(
        `SELECT id, name, email, password_hash, is_active
         FROM users
         WHERE email = @email`,
      );
    user = result.recordset[0];
  } catch (err) {
    console.error("[login] Query error:", (err as Error).message);
    return NextResponse.json(
      { error: "Error al iniciar sesion. Intenta mas tarde." },
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

  // ── 5. Firmar JWT y setear cookie ──────────────────────
  const token = await signToken({ sub: user.id, email: user.email, name: user.name });
  await setAuthCookie(token);

  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
