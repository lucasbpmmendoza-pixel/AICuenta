import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

const memberSchema = z.object({
  name:     z.string().trim().min(2, "El nombre es muy corto").max(120),
  email:    z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres").max(72),
});

// GET /api/team — Lista los miembros del equipo del owner actual
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role && session.role !== "owner") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("ownerId", session.sub)
      .query<{ id: string; name: string; email: string; created_at: string }>(
        `SELECT id, name, email, created_at
         FROM users
         WHERE owner_id = @ownerId
         ORDER BY created_at DESC`
      );
    return NextResponse.json({ members: result.recordset });
  } catch (err) {
    console.error("[team GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener miembros" }, { status: 503 });
  }
}

// POST /api/team — Crea un nuevo miembro para la cuenta del owner
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role && session.role !== "owner") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  if (session.sub === undefined) return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { name, email, password } = parsed.data;

  const db = await getDb();

  // Verificar que el correo no esté en uso
  const existing = await db
    .request()
    .input("email", email)
    .query<{ id: string }>("SELECT id FROM users WHERE email = @email");
  if (existing.recordset.length > 0) {
    return NextResponse.json({ error: "Ese correo ya esta registrado" }, { status: 409 });
  }

  // Limitar a 10 miembros por cuenta
  const count = await db
    .request()
    .input("ownerId", session.sub)
    .query<{ cnt: number }>("SELECT COUNT(1) AS cnt FROM users WHERE owner_id = @ownerId");
  if ((count.recordset[0]?.cnt ?? 0) >= 10) {
    return NextResponse.json({ error: "Limite de 10 usuarios por cuenta alcanzado" }, { status: 422 });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await db
      .request()
      .input("name",     name)
      .input("email",    email)
      .input("hash",     hash)
      .input("ownerId",  session.sub)
      .query(`
        INSERT INTO users (name, email, password_hash, is_active, email_verified, role, owner_id, account_type)
        VALUES (@name, @email, @hash, 1, 1, 'member', @ownerId, NULL)
      `);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team POST] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al crear el usuario" }, { status: 503 });
  }
}
