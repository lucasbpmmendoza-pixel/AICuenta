import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "auth_token";
const ALGORITHM = "HS256";
const EXPIRY = "7d";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export interface JWTPayload {
  sub: string;   // user id
  email: string;
  name: string;
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: [ALGORITHM],
  });
  return payload as unknown as JWTPayload;
}

// ── Tokens de verificación de correo (24h, purpose distinto) ──────────────

interface VerificationPayload {
  sub: string;   // user id
  email: string;
  purpose: "email_verification";
}

export async function signVerificationToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email, purpose: "email_verification" })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifyVerificationToken(token: string): Promise<VerificationPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALGORITHM] });
  if (payload["purpose"] !== "email_verification") {
    throw new Error("Invalid token purpose");
  }
  return payload as unknown as VerificationPayload;
}

// ── Tokens de restablecimiento de contraseña (1h) ────────────────────────

interface ResetPayload {
  sub: string;   // user id
  email: string;
  purpose: "password_reset";
}

export async function signResetToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email, purpose: "password_reset" })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getSecret());
}

export async function verifyResetToken(token: string): Promise<ResetPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALGORITHM] });
  if (payload["purpose"] !== "password_reset") {
    throw new Error("Invalid token purpose");
  }
  return payload as unknown as ResetPayload;
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días en segundos
  });
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
