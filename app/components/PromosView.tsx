"use client";

import { useState } from "react";

const CARGOS = [
  "Dueño(a)",
  "Director(a)",
  "Administrador(a)",
  "Contador(a)",
  "Auxiliar contable",
  "Otro",
] as const;

const BG_STYLE: React.CSSProperties = {
  backgroundImage:
    "url('/promos-bg.jpg'), linear-gradient(135deg, #7B6FE8 0%, #A5C4C8 50%, #91EB78 100%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

const inputCls =
  "mt-2 block h-14 w-full rounded-2xl border border-white/60 bg-white/80 px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#7B6FE8] focus:bg-white focus:ring-4 focus:ring-[#7B6FE8]/25 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#91EB78] dark:focus:bg-slate-900 dark:focus:ring-[#91EB78]/25";

const labelCls =
  "block text-sm font-semibold text-slate-800 dark:text-slate-200";

export default function PromosView() {
  const [nombre, setNombre]         = useState("");
  const [empresa, setEmpresa]       = useState("");
  const [cargoOpcion, setCargoOpcion] = useState<string>("");
  const [cargoOtro, setCargoOtro]   = useState("");
  const [celular, setCelular]       = useState("");
  const [correo, setCorreo]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [sent, setSent]             = useState(false);

  const esOtro = cargoOpcion === "Otro";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!cargoOpcion) {
      setError("Selecciona un cargo.");
      return;
    }
    const cargoFinal = esOtro ? cargoOtro.trim() : cargoOpcion;
    if (!cargoFinal) {
      setError("Escribe tu cargo.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const origen = params.get("utm_source") || params.get("utm_campaign") || "directo";

      const res = await fetch("/api/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre:  nombre.trim(),
          empresa: empresa.trim(),
          cargo:   cargoFinal,
          celular: celular.trim(),
          correo:  correo.trim(),
          origen:  origen.slice(0, 60),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos registrarte. Intenta más tarde.");
        return;
      }

      setSent(true);
    } catch {
      setError("Error de red. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6"
           style={{ ...BG_STYLE, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <div className="w-full max-w-[400px] rounded-3xl border border-white/30 bg-white/40 p-8 text-center shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-slate-950/25">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo6-blanco.png" alt="AIcuenta" className="mx-auto mb-6 h-16 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo6-negro.png"  alt="AIcuenta" className="mx-auto mb-6 hidden h-16 w-auto dark:block" />
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#7B6FE8]/15 text-4xl dark:bg-[#91EB78]/15">
            🎉
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            Quedaste registrado
          </h1>
          <p className="mt-3 text-base leading-6 text-slate-700 dark:text-slate-300">
            Pronto vas a recibir las promociones exclusivas de AICuenta en tu correo y número.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-8"
         style={{ ...BG_STYLE, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col">
        <div className="flex flex-1 flex-col rounded-3xl border border-white/30 bg-white/40 p-6 shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-slate-950/25">
          <header className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo6-blanco.png" alt="AIcuenta" className="mx-auto mb-3 h-16 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo6-negro.png"  alt="AIcuenta" className="mx-auto mb-3 hidden h-16 w-auto dark:block" />
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              Promociones <span className="text-[#7B6FE8] dark:text-[#91EB78]">AICuenta</span>
            </h1>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Regístrate y recibe las promociones exclusivas de AICuenta.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-1 flex-col space-y-4">
            <div>
              <label htmlFor="nombre" className={labelCls}>Nombre</label>
              <input
                id="nombre" type="text" required maxLength={120} autoComplete="name"
                value={nombre} onChange={(e) => setNombre(e.target.value)}
                disabled={loading} className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="empresa" className={labelCls}>Empresa o negocio</label>
              <input
                id="empresa" type="text" required maxLength={160} autoComplete="organization"
                value={empresa} onChange={(e) => setEmpresa(e.target.value)}
                disabled={loading} className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="cargo" className={labelCls}>Cargo</label>
              <select
                id="cargo" required
                value={cargoOpcion} onChange={(e) => setCargoOpcion(e.target.value)}
                disabled={loading}
                className={inputCls + " appearance-none bg-[right_1rem_center] bg-no-repeat pr-10"}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none' stroke='%2364748b' stroke-width='2'><path d='M6 8l4 4 4-4'/></svg>\")",
                }}
              >
                <option value="" disabled>Selecciona tu cargo</option>
                {CARGOS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {esOtro && (
                <input
                  type="text" required maxLength={60} autoFocus
                  placeholder="Escribe tu cargo"
                  value={cargoOtro} onChange={(e) => setCargoOtro(e.target.value)}
                  disabled={loading}
                  className={inputCls + " mt-3"}
                />
              )}
            </div>

            <div>
              <label htmlFor="correo" className={labelCls}>Correo</label>
              <input
                id="correo" type="email" required maxLength={160} autoComplete="email"
                value={correo} onChange={(e) => setCorreo(e.target.value)}
                disabled={loading} className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="celular" className={labelCls}>Número</label>
              <input
                id="celular" type="tel" required maxLength={20} inputMode="tel"
                pattern="[0-9+()\-\s]{7,20}" autoComplete="tel"
                placeholder="10 dígitos"
                value={celular} onChange={(e) => setCelular(e.target.value)}
                disabled={loading} className={inputCls}
              />
            </div>

            {error && (
              <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
                {error}
              </p>
            )}

            <div className="flex-1" />

            <button
              type="submit"
              disabled={loading}
              className="h-14 w-full rounded-2xl bg-[#7B6FE8] text-base font-semibold text-white shadow-xl shadow-[#7B6FE8]/40 transition hover:bg-[#6a5ed6] active:scale-[0.98] disabled:opacity-60 dark:bg-[#91EB78] dark:text-zinc-900 dark:shadow-[#91EB78]/40 dark:hover:bg-[#7fd968]"
            >
              {loading ? "Registrando..." : "Registrarme"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
