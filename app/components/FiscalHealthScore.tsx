'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const HIDDEN_KEY = 'fiscal_score_hidden'

interface Props {
  /** Ingresos del mes (total). */
  ingresos: number
  /** Egresos del mes (total). */
  egresos: number
  /** True mientras se cargan los datos: el score muestra un estado neutro. */
  loading?: boolean
}

type Estado = 'ganancia' | 'equilibrio' | 'perdida' | 'sin-datos'

const MXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

// Varias variantes de explicación por estado. Se interpola el margen real del
// mes. Al hacer hover se va rotando la variante para dar variedad ("con varias
// opciones") sin depender de una llamada a IA en cada paso del mouse.
const MENSAJES: Record<Estado, Array<(m: number) => string>> = {
  ganancia: [
    (m) => `Tus ingresos superan a tus egresos: cierras el mes con ganancia y un margen de utilidad del ${m}%.`,
    () => `Cada peso que entra deja utilidad después de cubrir tus gastos. Vas por buen camino, mantén el ritmo.`,
    (m) => `Buen desempeño fiscal. Con un margen del ${m}% tienes holgura para reinvertir o cubrir impuestos sin apuros.`,
  ],
  equilibrio: [
    () => `Estás prácticamente en punto de equilibrio: tus ingresos y egresos casi se igualan este mes.`,
    () => `Ni pérdida ni ganancia relevante. Un pequeño aumento en ventas o un recorte de gastos te llevaría a números negros.`,
    (m) => `Tu utilidad ronda el ${m}% de tus ingresos: estás en la línea, cuida que los gastos no la crucen.`,
  ],
  perdida: [
    (m) => `Tus egresos superan a tus ingresos: cierras en pérdida con un margen negativo del ${m}%.`,
    () => `Este mes gastas más de lo que ingresas. Revisa tus principales gastos para identificar dónde recortar.`,
    () => `El resultado es negativo. Considera aumentar ingresos o reducir egresos para revertir la tendencia.`,
  ],
  'sin-datos': [
    () => `Aún no hay ingresos ni egresos registrados en este periodo, así que no podemos calcular tu salud fiscal.`,
  ],
}

// Paleta por estado. Se usan colores explícitos (no clases) porque el <svg>
// necesita el hex directo tanto en el trazo como en el degradado.
const PALETA: Record<Estado, { from: string; to: string; label: string; texto: string }> = {
  ganancia:   { from: '#34d399', to: '#10b981', label: 'Ganancia',      texto: 'text-emerald-600 dark:text-emerald-400' },
  equilibrio: { from: '#fbbf24', to: '#f59e0b', label: 'En equilibrio', texto: 'text-amber-500 dark:text-amber-400' },
  perdida:    { from: '#fb7185', to: '#f43f5e', label: 'En pérdida',    texto: 'text-rose-500 dark:text-rose-400' },
  'sin-datos':{ from: '#94a3b8', to: '#64748b', label: 'Sin datos',     texto: 'text-slate-400 dark:text-zinc-500' },
}

/**
 * Convierte la utilidad del mes (ingresos − egresos) en un puntaje 0-100 de
 * "salud fiscal". La lógica gira en torno al margen de utilidad:
 *   margen 0  (tablas)      -> 50
 *   margen +0.5 (50% util.) -> 90
 *   margen −0.5 (50% pérd.) -> 10
 * Se acota a [0, 100]. Si no hay actividad el score es neutro (50, sin datos).
 */
function calcularScore(ingresos: number, egresos: number): { score: number; estado: Estado } {
  const utilidad = ingresos - egresos
  const base = ingresos > 0 ? ingresos : egresos
  if (base <= 0) return { score: 50, estado: 'sin-datos' }

  const margen = utilidad / base
  const score = Math.round(Math.max(0, Math.min(100, 50 + margen * 80)))

  let estado: Estado
  if (margen > 0.02) estado = 'ganancia'
  else if (margen < -0.02) estado = 'perdida'
  else estado = 'equilibrio'

  return { score, estado }
}

// Anillo circular de progreso.
function Ring({ score, from, to, size = 56, id }: {
  score: number; from: string; to: string; size?: number; id: string
}) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - score / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {/* Pista */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-zinc-700"
        />
        {/* Progreso */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={`url(#grad-${id})`}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-black tabular-nums text-slate-800 dark:text-zinc-100 leading-none">
          {score}
        </span>
      </div>
    </div>
  )
}

export default function FiscalHealthScore({ ingresos, egresos, loading = false }: Props) {
  const [hidden, setHidden] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Restaurar preferencia de visibilidad (persistida entre sesiones).
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      setHidden(localStorage.getItem(HIDDEN_KEY) === '1')
    }
  }, [])

  function ocultar() {
    setHidden(true)
    if (typeof window !== 'undefined') localStorage.setItem(HIDDEN_KEY, '1')
  }

  function mostrar() {
    setHidden(false)
    if (typeof window !== 'undefined') localStorage.setItem(HIDDEN_KEY, '0')
  }

  const { score, estado } = useMemo(() => {
    if (loading) return { score: 0, estado: 'sin-datos' as Estado }
    return calcularScore(ingresos, egresos)
  }, [ingresos, egresos, loading])

  const utilidad = ingresos - egresos
  const base = ingresos > 0 ? ingresos : egresos
  const margenPct = base > 0 ? Math.round((utilidad / base) * 100) : 0

  // Tooltip explicativo: se muestra al hover/focus y rota la variante del
  // mensaje en cada apertura para ofrecer varias explicaciones distintas.
  const [tipOpen, setTipOpen] = useState(false)
  const [variante, setVariante] = useState(0)
  const pool = MENSAJES[estado]
  const mensaje = pool[variante % pool.length](Math.abs(margenPct))

  function abrirTip() {
    setVariante((v) => v + 1)
    setTipOpen(true)
  }

  // Animación de conteo del número.
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    if (loading) { setDisplay(0); return }
    const start = performance.now()
    const from = display
    const duration = 700
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (score - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, loading])

  if (!mounted) return null

  const paleta = PALETA[estado]

  // Botón compacto cuando está oculto.
  if (hidden) {
    return (
      <button
        type="button"
        onClick={mostrar}
        aria-label="Mostrar salud fiscal"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-slate-200/70 dark:border-zinc-700/70 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md shadow-lg shadow-black/10 px-3 py-2 transition hover:scale-[1.03] active:scale-95"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full opacity-90"
            style={{ background: `linear-gradient(135deg, ${paleta.from}, ${paleta.to})` }}
          />
          <span className="relative text-[10px] font-black text-white leading-none">
            {loading ? '·' : display}
          </span>
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Salud fiscal</span>
      </button>
    )
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
      onMouseEnter={abrirTip}
      onMouseLeave={() => setTipOpen(false)}
    >
      {/* Tooltip explicativo */}
      {tipOpen && !loading && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 mb-3 w-[276px] -translate-x-1/2 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl shadow-black/20 p-4 animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: `linear-gradient(135deg, ${paleta.from}, ${paleta.to})` }} />
            <p className={`text-sm font-black ${paleta.texto}`}>{paleta.label}</p>
            <span className="ml-auto text-sm font-black tabular-nums text-slate-800 dark:text-zinc-100">{score}<span className="text-[10px] font-semibold text-slate-400">/100</span></span>
          </div>

          {estado !== 'sin-datos' && (
            <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-zinc-400">Ingresos</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">{MXN(ingresos)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-zinc-400">Egresos</span>
                <span className="font-bold text-rose-500 dark:text-rose-400 tabular-nums">− {MXN(egresos)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-zinc-700 pt-1.5 text-xs">
                <span className="font-semibold text-slate-600 dark:text-zinc-300">Utilidad</span>
                <span className={`font-black tabular-nums ${utilidad >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  {MXN(utilidad)} <span className="text-[10px] font-semibold text-slate-400">({margenPct}%)</span>
                </span>
              </div>
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">{mensaje}</p>

          {/* Flecha */}
          <span className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
        </div>
      )}

      <div
        tabIndex={0}
        onFocus={abrirTip}
        onBlur={() => setTipOpen(false)}
        className="flex items-center gap-3 rounded-2xl border border-slate-200/70 dark:border-zinc-700/70 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md shadow-xl shadow-black/10 pl-2.5 pr-3 py-2 cursor-help focus:outline-none focus:ring-2 focus:ring-[#7B6FE8]/50"
      >
        <Ring score={loading ? 0 : display} from={paleta.from} to={paleta.to} id={estado} />

        <div className="min-w-[92px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 leading-none">
            Salud fiscal
          </p>
          <p className={`text-sm font-black leading-tight mt-1 ${paleta.texto}`}>
            {loading ? 'Calculando…' : paleta.label}
          </p>
        </div>

        <button
          type="button"
          onClick={ocultar}
          aria-label="Ocultar salud fiscal"
          className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
