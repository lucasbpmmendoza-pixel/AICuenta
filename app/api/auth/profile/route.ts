import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { clearAuthCookie, signToken, setAuthCookie } from "@/lib/auth";

const updateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Correo inválido")
    .max(254, "El correo no puede exceder 254 caracteres"),
  currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
  newPassword: z
    .string()
    .max(128)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { name, email, currentPassword, newPassword } = parsed.data;

  let db;
  try { db = await getDb(); } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 503 });
  }

  // Verificar contraseña actual
  const userResult = await db
    .request()
    .input("id", session.sub)
    .query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = @id");

  const user = userResult.recordset[0];
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 401 });

  // Verificar email único si cambió
  if (email !== session.email) {
    const emailCheck = await db
      .request()
      .input("email", email)
      .input("id", session.sub)
      .query<{ cnt: number }>("SELECT COUNT(1) AS cnt FROM users WHERE email = @email AND id <> @id");
    if ((emailCheck.recordset[0]?.cnt ?? 0) > 0) {
      return NextResponse.json({ error: "Ese correo ya está en uso" }, { status: 409 });
    }
  }

  // Construir query de actualización
  const newHash = newPassword ? await bcrypt.hash(newPassword, 12) : null;

  const request = db.request().input("id", session.sub).input("name", name).input("email", email);
  if (newHash) request.input("password_hash", newHash);

  await request.query(
    newHash
      ? "UPDATE users SET name = @name, email = @email, password_hash = @password_hash WHERE id = @id"
      : "UPDATE users SET name = @name, email = @email WHERE id = @id"
  );

  // Re-emitir cookie con datos actualizados
  const newToken = await signToken({ sub: session.sub, email, name, role: session.role, ownerId: session.ownerId });
  await setAuthCookie(newToken);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { password?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!body.password) return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });

  let db;
  try { db = await getDb(); } catch {
    return NextResponse.json({ error: "Error de conexión" }, { status: 503 });
  }

  const userRes = await db.request()
    .input("id", session.sub)
    .query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = @id");
  const user = userRes.recordset[0];
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const valid = await bcrypt.compare(body.password, user.password_hash);
  if (!valid) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 403 });

  await db.request().input("id", session.sub).query("DELETE FROM users WHERE id = @id");
  await clearAuthCookie();

  return NextResponse.json({ ok: true });
}
