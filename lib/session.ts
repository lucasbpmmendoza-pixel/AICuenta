import { cookies } from "next/headers";
import { verifyToken, type JWTPayload } from "./auth";

/**
 * Obtiene la sesión del usuario desde la cookie JWT.
 * Para usar en Server Components y Route Handlers.
 * Retorna null si no hay sesión o el token es inválido.
 */
export async function getSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}
