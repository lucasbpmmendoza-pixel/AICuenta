import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isFreemiumOwner } from "@/lib/freemium";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  // isFreemium se calcula contra el dueño; fail-open dentro de isFreemiumOwner.
  const isFreemium = await isFreemiumOwner(session);
  return NextResponse.json({
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      isFreemium,
    },
  });
}
