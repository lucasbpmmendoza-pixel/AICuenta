"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Credenciales incorrectas.");
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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(99,102,241,0.15),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,rgba(20,86,73,0.18),transparent_55%)]" />
        <div className="relative flex flex-col items-center text-center">
          <Image
            src="/logo.webp"
            alt="AIcuenta"
            width={360}
            height={360}
            className="mb-2 rounded-3xl"
            priority
          />
          <p className="mt-2 max-w-[220px] text-sm leading-6 text-white/45">
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
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Bienvenido de vuelta
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Ingresa tus credenciales para acceder a tu cuenta.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
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
                >
                  Contrasena
                </label>
                <a
                  href="#"
                  className="text-xs font-semibold text-slate-400 transition hover:text-slate-700"
                >
                  Olvide mi contrasena
                </a>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/8"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-60"
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
            >
              Crear cuenta gratis
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
