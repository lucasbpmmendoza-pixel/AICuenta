import { NextRequest, NextResponse } from "next/server";
import { verifyVerificationToken, signToken, setAuthCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPostLoginRedirect } from "@/lib/redirect";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const loginUrl = new URL("/login", req.url);

  if (!token) {
    loginUrl.searchParams.set("error", "token_missing");
    return NextResponse.redirect(loginUrl);
  }

  // ── 1. Verificar token ─────────────────────────────────
  let payload: { sub: string; email: string };
  try {
    payload = await verifyVerificationToken(token);
  } catch {
    loginUrl.searchParams.set("error", "token_invalid");
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Marcar email_verified = 1 en BD ─────────────────
  let user: { id: string; name: string; email: string } | undefined;
  try {
    const db = await getDb();
    const req = db.request().input("id", payload.sub);

    // UPDATE solo si aún no estaba verificado
    const updateResult = await req.query<{ rowsAffected: number }>(
      `UPDATE users SET email_verified = 1 WHERE id = @id AND email_verified = 0`,
    );

    if (updateResult.rowsAffected[0] === 0) {
      // Ya verificado antes — redirigir al login sin error
      return NextResponse.redirect(loginUrl);
    }

    // SELECT separado (necesario porque el trigger impide OUTPUT sin INTO)
    const selectResult = await db
      .request()
      .input("id", payload.sub)
      .query<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM users WHERE id = @id`,
      );

    user = selectResult.recordset[0];
  } catch (err) {
    console.error("[verify] DB error:", (err as Error).message);
    loginUrl.searchParams.set("error", "server_error");
    return NextResponse.redirect(loginUrl);
  }

  // ── 3. Login automático: firmar JWT y setear cookie ────
  const authToken = await signToken({ sub: user.id, email: user.email, name: user.name });
  await setAuthCookie(authToken);

  const redirectTo = await getPostLoginRedirect(user.id);
  return NextResponse.redirect(new URL(redirectTo, req.url));
}
