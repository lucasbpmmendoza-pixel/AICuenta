import { cookies } from "next/headers";
import { verifyToken, type JWTPayload } from "./auth";
import { buildDemoSession, DEMO_COOKIE_NAME, isDemoCookieEnabled } from "./demo-mode";

/**
 * Obtiene la sesión del usuario desde la cookie JWT.
 * Para usar en Server Components y Route Handlers.
 * Retorna null si no hay sesión o el token es inválido.
 */
export async function getSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) {
      const demoCookie = cookieStore.get(DEMO_COOKIE_NAME)?.value;
      return isDemoCookieEnabled(demoCookie) ? buildDemoSession() : null;
    }
    return await verifyToken(token);
  } catch {
    try {
      const cookieStore = await cookies();
      const demoCookie = cookieStore.get(DEMO_COOKIE_NAME)?.value;
      return isDemoCookieEnabled(demoCookie) ? buildDemoSession() : null;
    } catch {
      return null;
    }
  }
}
