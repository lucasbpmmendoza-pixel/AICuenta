import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyResetToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

const schema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
});

export async function POST(req: NextRequest) {
  // ── 1. Validar body ────────────────────────────────────
  let token: string, password: string;
  try {
    ({ token, password } = schema.parse(await req.json()));
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0].message : "Datos inválidos.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── 2. Verificar token ─────────────────────────────────
  let payload: { sub: string; email: string };
  try {
    payload = await verifyResetToken(token);
  } catch {
    return NextResponse.json(
      { error: "El enlace no es válido o ya expiró." },
      { status: 400 },
    );
  }

  // ── 3. Hashear nueva contraseña ────────────────────────
  const passwordHash = await bcrypt.hash(password, 12);

  // ── 4. Actualizar en BD ────────────────────────────────
  try {
    const db = await getDb();
    await db
      .request()
      .input("hash", passwordHash)
      .input("id", payload.sub)
      .query(`UPDATE users SET password_hash = @hash WHERE id = @id AND is_active = 1`);
  } catch (err) {
    console.error("[reset-password] DB error:", (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo actualizar la contraseña. Intenta más tarde." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
