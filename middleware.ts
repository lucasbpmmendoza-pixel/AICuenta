import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { DEMO_COOKIE_NAME, isDemoCookieEnabled } from "@/lib/demo-mode";

const COOKIE_NAME = "auth_token";
const PROTECTED = ["/dashboard", "/upload-fiel"];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const demoRequested = req.nextUrl.searchParams.get("demo") === "1";
  const demoEnabled = isDemoCookieEnabled(req.cookies.get(DEMO_COOKIE_NAME)?.value);

  if (!token && (demoRequested || demoEnabled)) {
    const res = NextResponse.next();
    if (demoRequested && !demoEnabled) {
      res.cookies.set(DEMO_COOKIE_NAME, "1", {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }
    return res;
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const res = NextResponse.next();
    if (demoEnabled) res.cookies.delete(DEMO_COOKIE_NAME);
    return res;
  } catch {
    // Token expirado o inválido
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/upload-fiel/:path*"],
};
