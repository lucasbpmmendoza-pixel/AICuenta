import type { JWTPayload } from "@/lib/auth";

export const DEMO_COOKIE_NAME = "demo_mode";

export function isDemoCookieEnabled(value: string | undefined): boolean {
  return value === "1";
}

export function buildDemoSession(): JWTPayload {
  return {
    sub: "demo-user",
    email: "demo@aicuenta.local",
    name: "Demo AIcuenta",
    role: "owner",
    isDemo: true,
  };
}

export function isDemoSession(session: JWTPayload | null | undefined): boolean {
  return !!session?.isDemo;
}
