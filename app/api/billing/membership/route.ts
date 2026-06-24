import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resolveMembership } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const state = await resolveMembership(session);
  return NextResponse.json(state);
}
