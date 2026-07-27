import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const promoSchema = z.object({
  nombre:  z.string().trim().min(1, "Nombre requerido").max(120),
  celular: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, "Celular invalido"),
  correo:  z.string().trim().email("Correo invalido").max(160),
  origen:  z.string().trim().max(60).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const parsed = promoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { nombre, celular, correo, origen } = parsed.data;

  try {
    const db = await getDb();
    await db.request()
      .input("nombre",  nombre)
      .input("celular", celular)
      .input("correo",  correo)
      .input("origen",  origen ?? null)
      .query(`
        INSERT INTO AIC_promos_registros (nombre, celular, correo, origen)
        VALUES (@nombre, @celular, @correo, @origen)
      `);
  } catch (err) {
    console.error("[promos] Error al guardar registro:", (err as Error).message);
    return NextResponse.json({ error: "No pudimos registrarte. Intenta mas tarde." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
