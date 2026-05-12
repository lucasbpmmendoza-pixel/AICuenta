"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useRecaptcha } from "@/app/hooks/useRecaptcha";

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Inicio de sesion con Google cancelado.",
  google_error: "Error al iniciar sesion con Google. Intenta de nuevo.",
  google_unverified: "Tu cuenta de Google no tiene el correo verificado.",
  server_error: "Error del servidor. Intenta de nuevo.",
  token_invalid: "El enlace no es valido o ya expiro.",
  token_missing: "El enlace no es valido.",
};

export default function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const { getToken } = useRecaptcha();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(urlError ? (GOOGLE_ERRORS[urlError] ?? "Error al iniciar sesion.") : "");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const recaptchaToken = await getToken("login");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, recaptchaToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "email_not_verified") {
          setError("Verifica tu correo electronico antes de iniciar sesion. Revisa tu bandeja de entrada.");
        } else {
          setError(data.error ?? "Credenciales incorrectas.");
        }
        return;
      }

      router.push(data.redirectTo ?? "/dashboard");
    } catch {
      setError("Error de red. Verifica tu conexion e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="relative hidden w-[46%] flex-col items-center justify-center overflow-hidden bg-slate-950 px-12 py-12 lg:flex xl:w-[42%]">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20"
          src="/Video.mp4"
          onLoadedData={e => { (e.target as HTMLVideoElement).playbackRate = 2 }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(99,102,241,0.15),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,rgba(20,86,73,0.18),transparent_55%)]" />
        <div className="relative flex flex-col items-center text-center">
          <Image
            src="/logo3.webp"
            alt="AIcuenta"
            width={360}
            height={360}
            className="mb-2"
            style={{ width: 360, height: 'auto' }}
            priority
          />
          <p className="mt-2 max-w-[220px] text-sm leading-6 text-[#7B6FE8]">
            Claridad fiscal desde tus datos, sin captura manual.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-12">
        <p className="mb-8 text-xs font-black uppercase tracking-[0.36em] text-slate-400 lg:hidden">
          AIcuenta
        </p>

        <div className="w-full max-w-[400px]">
          <h1 className="text-3xl font-black tracking-tight text-slate-950" style={{ color: "#450c7d" }}>
            Bienvenido de vuelta
          </h1>
          <p className="mt-2 text-sm text-slate-500" style={{ color: "#7B6FE8" }}>
            Ingresa tus credenciales para acceder a tu cuenta.
          </p>

          {/* ── Botón Google ── */}
          <a
            href="/api/auth/google"
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z" fill="#4285F4"/>
              <path d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7252 38.5039 24.4888 38.5039C18.2275 38.5039 12.9187 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z" fill="#34A853"/>
              <path d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3922 11.0051 19.4115V13.2296H3.03298C-0.371021 20.0112 -0.371021 28.0009 3.03298 34.7825L11.0051 28.6006Z" fill="#FBBC04"/>
              <path d="M24.48 9.49932C27.9016 9.44641 31.2086 10.7339 33.6866 13.0973L40.5387 6.24523C36.2 2.17101 30.4414 -0.068932 24.48 0.00161733C15.4055 0.00161733 7.10718 5.11644 3.03296 13.2296L11.005 19.4115C12.901 13.7235 18.2187 9.49932 24.48 9.49932Z" fill="#EA4335"/>
            </svg>
            Continuar con Google
          </a>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400" style={{ color: "#7B6FE8" }}>O continua con tu correo</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
                style={{ color: "#450c7d" }}
              >
                Correo electronico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/8"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
                  style={{ color: "#450c7d" }}
                >
                  Contrasena
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs font-semibold transition"
                  style={{ color: "#7B6FE8" }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#450c7d')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#7B6FE8')}
                >
                  Olvide mi contrasena
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-extrabold text-white transition disabled:opacity-60"
              style={{ backgroundColor: "#450c7d" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#7B6FE8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#450c7d')}
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Iniciar sesion"
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            ¿No tienes cuenta?{" "}
            <a
              href="/register"
              className="font-bold text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
              style={{ color: "#450c7d" }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#7B6FE8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#450c7d')}
                
            >
              Crear cuenta gratis
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
