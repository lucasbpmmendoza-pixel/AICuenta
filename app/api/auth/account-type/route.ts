import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";

const accountTypeSchema = z.object({
  account_type: z.enum(["multi", "single"]),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let db;
  try {
    db = await getDb();
  } catch {
    return NextResponse.json({ error: "Error de conexion" }, { status: 503 });
  }

  let accountType: string | null = null;
  let planType: string | null = "basic";

  try {
    const result = await db
      .request()
      .input("id", session.sub)
      .query<{ account_type: string | null; plan_type?: string | null }>(
        "SELECT account_type, plan_type FROM users WHERE id = @id"
      );
    accountType = result.recordset[0]?.account_type ?? null;
    planType = result.recordset[0]?.plan_type ?? "basic";
  } catch {
    const fallback = await db
      .request()
      .input("id", session.sub)
      .query<{ account_type: string | null }>(
        "SELECT account_type FROM users WHERE id = @id"
      );
    accountType = fallback.recordset[0]?.account_type ?? null;
    planType = "basic";
  }

  return NextResponse.json({ account_type: accountType, plan_type: planType });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const parsed = accountTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Tipo de cuenta invalido" },
      { status: 422 }
    );
  }

  let db;
  try {
    db = await getDb();
  } catch {
    return NextResponse.json({ error: "Error de conexion" }, { status: 503 });
  }

  try {
    await db
      .request()
      .input("id", session.sub)
      .input("account_type", parsed.data.account_type)
      .query(
        "UPDATE users SET account_type = @account_type, plan_type = COALESCE(plan_type, 'basic') WHERE id = @id",
      );
  } catch {
    await db
      .request()
      .input("id", session.sub)
      .input("account_type", parsed.data.account_type)
      .query("UPDATE users SET account_type = @account_type WHERE id = @id");
  }

  return NextResponse.json({ ok: true });
}
