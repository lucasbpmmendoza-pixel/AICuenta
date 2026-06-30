import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { loadOwnerPlanLimits } from "@/lib/account-plan";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";

const memberSchema = z.object({
  name:     z.string().trim().min(2, "El nombre es muy corto").max(120),
  email:    z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
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
  if (session.sub === undefined) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  if (await isFreemiumOwner(session)) {
    return NextResponse.json({ error: FREEMIUM_FORBIDDEN_MESSAGE }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { name, email, password } = parsed.data;

  const db = await getDb();

  const limits = await loadOwnerPlanLimits(db, session.sub);
  if (limits.accountType !== "multi") {
    return NextResponse.json(
      { error: "Solo las cuentas empresariales pueden agregar miembros." },
      { status: 422 },
    );
  }

  if (limits.maxMembers <= 0) {
    return NextResponse.json(
      { error: "Tu plan actual no incluye miembros de equipo. Actualiza a un plan empresarial superior." },
      { status: 422 },
    );
  }

  // Verificar que el correo no esté en uso
  const existing = await db
    .request()
    .input("email", email)
    .query<{ id: string }>("SELECT id FROM users WHERE email = @email");
  if (existing.recordset.length > 0) {
    return NextResponse.json({ error: "Ese correo ya esta registrado" }, { status: 409 });
  }

  // Límite de miembros segun plan
  const count = await db
    .request()
    .input("ownerId", session.sub)
    .query<{ cnt: number }>("SELECT COUNT(1) AS cnt FROM users WHERE owner_id = @ownerId");
  if ((count.recordset[0]?.cnt ?? 0) >= limits.maxMembers) {
    return NextResponse.json(
      { error: `Límite de ${limits.maxMembers} usuarios por cuenta alcanzado para tu plan ${limits.planType}.` },
      { status: 422 },
    );
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
        INSERT INTO users (name, email, password_hash, is_active, email_verified, role, owner_id, account_type, plan_type)
        VALUES (@name, @email, @hash, 1, 1, 'member', @ownerId, NULL, 'basic')
      `);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team POST] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al crear el usuario" }, { status: 503 });
  }
}
