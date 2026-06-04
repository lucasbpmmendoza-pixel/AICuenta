import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";
import { DEMO_COOKIE_NAME } from "@/lib/demo-mode";

export async function POST() {
  await clearAuthCookie();
  const res = NextResponse.json({ ok: true, redirectTo: "/login" });
  res.cookies.delete(DEMO_COOKIE_NAME);
  return res;
}
