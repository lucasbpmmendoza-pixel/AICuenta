import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const promoSchema = z.object({
  nombre:  z.string().trim().min(1, "Nombre requerido").max(120),
  empresa: z.string().trim().min(1, "Empresa requerida").max(160),
  cargo:   z.string().trim().min(1, "Cargo requerido").max(60),
  celular: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, "Número inválido"),
  correo:  z.string().trim().email("Correo inválido").max(160),
  origen:  z.string().trim().max(60).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = promoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { nombre, empresa, cargo, celular, correo, origen } = parsed.data;

  try {
    const db = await getDb();
    await db.request()
      .input("nombre",  nombre)
      .input("empresa", empresa)
      .input("cargo",   cargo)
      .input("celular", celular)
      .input("correo",  correo)
      .input("origen",  origen ?? null)
      .query(`
        INSERT INTO AIC_promos_registros (nombre, empresa, cargo, celular, correo, origen)
        VALUES (@nombre, @empresa, @cargo, @celular, @correo, @origen)
      `);
  } catch (err) {
    console.error("[promos] Error al guardar registro:", (err as Error).message);
    return NextResponse.json({ error: "No pudimos registrarte. Intenta más tarde." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
