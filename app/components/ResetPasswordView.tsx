"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer la contraseña.");
        return;
      }

      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Error de red. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-[400px] text-center">
          <p className="text-sm text-slate-500">Enlace no válido.</p>
          <a
            href="/login"
            className="mt-4 inline-block text-sm font-bold transition hover:underline"
            style={{ color: '#450c7d' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#7B6FE8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#450c7d')}
          >
            Volver al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  // ── Pantalla: contraseña cambiada exitosamente ─────────
  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-[400px] text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-green-50 text-3xl">
            ✅
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: '#450c7d' }}>
            Contraseña actualizada
          </h1>
          <p className="mt-3 text-sm leading-6" style={{ color: '#7B6FE8' }}>
            Tu contrasena fue restablecida correctamente.<br />
            Redirigiendo al inicio de sesión...
          </p>
        </div>
      </div>
    );
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
            src="/logo4.png"
            alt="AIcuenta"
            width={360}
            height={360}
            className="mb-2"
            style={{ width: 360, height: 'auto' }}
            priority
          />
          <p className="mt-2 max-w-[220px] text-sm leading-6 text-[#aedb4a]">
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
          <h1 className="text-3xl font-black tracking-tight" style={{ color: '#450c7d' }}>
            Nueva contraseña
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#7B6FE8' }}>
            Elige una contraseña segura para tu cuenta.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
                style={{ color: '#450c7d' }}
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Min. 8 caracteres, una mayúscula y un número
              </p>
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
                style={{ color: '#450c7d' }}
              >
                Confirmar contraseña
              </label>
              <input
                id="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-extrabold text-white transition disabled:opacity-60"
              style={{ backgroundColor: '#450c7d' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#7B6FE8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#450c7d')}
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Restablecer contraseña"
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            <a
              href="/login"
              className="font-bold transition hover:underline"
              style={{ color: '#450c7d' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#7B6FE8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#450c7d')}
            >
              Volver al inicio de sesión
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
