import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import sql from "mssql";
import { getDb } from "@/lib/db";
import { signToken, setAuthCookie } from "@/lib/auth";
import { getPostLoginRedirect } from "@/lib/redirect";

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  error?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  verified_email: boolean;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const loginUrl = new URL("/login", req.url);
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  // ── 1. Error explícito de Google (ej. usuario canceló) ─
  if (googleError) {
    loginUrl.searchParams.set("error", "google_cancelled");
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set("error", "google_error");
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Verificar CSRF state ────────────────────────────
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!savedState || savedState !== state) {
    loginUrl.searchParams.set("error", "google_error");
    return NextResponse.redirect(loginUrl);
  }

  // ── 3. Intercambiar code por access token ──────────────
  let tokenData: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error ?? "Token exchange failed");
    }
  } catch (err) {
    console.error("[google/callback] Token error:", (err as Error).message);
    loginUrl.searchParams.set("error", "google_error");
    return NextResponse.redirect(loginUrl);
  }

  // ── 4. Obtener info del usuario de Google ──────────────
  let googleUser: GoogleUserInfo;
  try {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) throw new Error("Userinfo fetch failed");
    googleUser = await userRes.json();
  } catch (err) {
    console.error("[google/callback] Userinfo error:", (err as Error).message);
    loginUrl.searchParams.set("error", "google_error");
    return NextResponse.redirect(loginUrl);
  }

  if (!googleUser.verified_email) {
    loginUrl.searchParams.set("error", "google_unverified");
    return NextResponse.redirect(loginUrl);
  }

  // ── 5. Crear o recuperar usuario en BD ─────────────────
  let user: { id: string; name: string; email: string };
  try {
    const db = await getDb();

    // Buscar por google_id primero, luego por email
    const existing = await db
      .request()
      .input("googleId", sql.NVarChar(255), googleUser.id)
      .input("email", sql.NVarChar(254), googleUser.email)
      .query<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM users
         WHERE google_id = @googleId OR email = @email`,
      );

    console.log("[google/callback] existing rows:", existing.recordset.length);

    if (existing.recordset[0]) {
      user = existing.recordset[0];
      console.log("[google/callback] user found, id:", user.id, "will link google_id:", googleUser.id);

      // Vincular google_id — cast explícito a UNIQUEIDENTIFIER para evitar error de tipo
      const updateResult = await db
        .request()
        .input("googleId", sql.NVarChar(255), googleUser.id)
        .input("email", sql.NVarChar(254), user.email)
        .query(
          `UPDATE users SET google_id = @googleId
           WHERE email = @email AND google_id IS NULL`,
        );
      console.log("[google/callback] google_id linked, rows affected:", updateResult.rowsAffected[0]);
    } else {
      console.log("[google/callback] no user found, creating new:", googleUser.email);

      // Crear nuevo usuario con NEWID()
      await db
        .request()
        .input("name", sql.NVarChar(120), googleUser.name)
        .input("email", sql.NVarChar(254), googleUser.email)
        .input("googleId", sql.NVarChar(255), googleUser.id)
        .query(
          `INSERT INTO users (id, name, email, google_id, password_hash, email_verified, is_active)
           VALUES (NEWID(), @name, @email, @googleId, NULL, 1, 1)`,
        );

      const created = await db
        .request()
        .input("email", sql.NVarChar(254), googleUser.email)
        .query<{ id: string; name: string; email: string }>(
          `SELECT id, name, email FROM users WHERE email = @email`,
        );
      user = created.recordset[0];
      console.log("[google/callback] new user created, id:", user.id);
    }
  } catch (err) {
    console.error("[google/callback] DB error:", (err as Error).message);
    loginUrl.searchParams.set("error", "server_error");
    return NextResponse.redirect(loginUrl);
  }

  // ── 6. Firmar JWT y setear cookie ──────────────────────
  const token = await signToken({ sub: user.id, email: user.email, name: user.name });
  await setAuthCookie(token);

  const redirectTo = await getPostLoginRedirect(user.id);
  return NextResponse.redirect(new URL(redirectTo, req.url));
}
