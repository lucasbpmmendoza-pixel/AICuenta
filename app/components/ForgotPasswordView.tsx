"use client";

import Image from "next/image";
import { useState } from "react";

export default function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al procesar la solicitud.");
        return;
      }

      setSent(true);
    } catch {
      setError("Error de red. Verifica tu conexion e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // ── Pantalla: correo enviado ───────────────────────────
  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-[400px] text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-3xl">
            ✉️
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Revisa tu correo
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Si{" "}
            <span className="font-semibold text-slate-700">{email}</span>{" "}
            esta registrado, recibirás un enlace para restablecer tu contrasena.
          </p>
          <p className="mt-6 text-xs text-slate-400">
            ¿No lo ves? Revisa tu carpeta de spam.<br />
            El enlace expira en 1 hora.
          </p>
          <a
            href="/login"
            className="mt-8 inline-block text-sm font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            Volver al inicio de sesion
          </a>
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
            Olvide mi contrasena
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#7B6FE8' }}>
            Ingresa tu correo y te enviaremos un enlace para restablecer tu contrasena.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
              style={{ color: '#450c7d' }}
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
                "Enviar enlace"
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            <a
              href="/login"
              className="font-bold text-slate-700  transition hover:text-slate-950 hover:underline"
              style={{ color: '#450c7d' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#7B6FE8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#450c7d')}
              >
              Volver al inicio de sesion
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
