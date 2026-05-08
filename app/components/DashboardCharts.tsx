'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useTheme } from '@/app/hooks/useTheme'

// ── Tipos públicos ──────────────────────────────────────────────
export interface DashboardData {
  ingresos: {
    total: number; count: number;
    vigentes: number; cancelados: number;
    ivaTotal: number; ivaRetenido: number;
    isrEstimado: number;
    regimenFiscal: string;
    regimenLabel: string;
  }
  egresos: { total: number; count: number }
  topClientes:          Array<{ nombre: string; monto: number }>
  topProveedores:       Array<{ nombre: string; monto: number }>
  topConceptosIngresos: Array<{ concepto: string; monto: number }>
  topConceptosEgresos:  Array<{ concepto: string; monto: number }>
}

interface Props {
  data: DashboardData | null
  loading: boolean
  mes: string
  anio: number
}

// ── Formato moneda ─────────────────────────────────────────────
const MXN = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const DONUT_COLORS = ['#3b82f6', '#f43f5e']

// ── Tooltip personalizado ──────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ color: string; value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-lg px-3 py-2.5 text-xs">
      {label && <p className="font-semibold text-slate-600 dark:text-zinc-300 mb-1 truncate max-w-[200px]">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-black text-sm">{MXN(p.value)}</p>
      ))}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────
type ColorKey = 'blue' | 'rose' | 'emerald' | 'amber' | 'violet' | 'slate'
const ACCENT: Record<ColorKey, string> = {
  blue:    'text-blue-600 dark:text-blue-400',
  rose:    'text-rose-500 dark:text-rose-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber:   'text-amber-500 dark:text-amber-400',
  violet:  'text-violet-600 dark:text-violet-400',
  slate:   'text-slate-700 dark:text-zinc-100',
}

function KpiCard({ label, value, sub, color = 'slate', icon, skeleton }: {
  label: string; value: string; sub?: string; color?: ColorKey; icon: React.ReactNode; skeleton?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-start gap-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-800">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">{label}</p>
        {skeleton ? (
          <div className="h-6 w-28 rounded-lg bg-slate-100 dark:bg-zinc-800 animate-pulse mt-1" />
        ) : (
          <>
            <p className={`text-xl font-black tracking-tight leading-none ${ACCENT[color]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 leading-tight">{sub}</p>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Chart Card ─────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, className = '' }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
        <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[190px] gap-2 text-center">
      <svg className="h-8 w-8 text-slate-200 dark:text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <p className="text-xs text-slate-400 dark:text-zinc-500">{label}</p>
    </div>
  )
}

// ── Iconos ─────────────────────────────────────────────────────
const IconIngresos = () => (
  <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 7l-5-5-5 5" />
  </svg>
)
const IconEgresos = () => (
  <svg className="h-5 w-5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22V2M7 17l5 5 5-5" />
  </svg>
)
const IconUtilidad = () => (
  <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)
const IconCFDI = () => (
  <svg className="h-5 w-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="12" y2="17" />
  </svg>
)
const IconISR = () => (
  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="16" />
    <line x1="10" y1="14" x2="14" y2="14" />
  </svg>
)
const IconIVA = () => (
  <svg className="h-5 w-5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

// ── Componente principal ───────────────────────────────────────
export default function DashboardCharts({ data, loading, mes, anio }: Props) {
  const { dark } = useTheme()

  const gridColor  = dark ? '#3f3f46' : '#e2e8f0'
  const axisColor  = dark ? '#71717a' : '#94a3b8'
  const cursorFill = dark ? '#27272a' : '#f8fafc'
  const barProps   = { cursor: { fill: cursorFill } }

  const periodo = `${mes} ${anio}`

  const ingresos  = data?.ingresos  ?? { total: 0, count: 0, vigentes: 0, cancelados: 0, ivaTotal: 0, ivaRetenido: 0, isrEstimado: 0, regimenFiscal: '', regimenLabel: '' }
  const egresos   = data?.egresos   ?? { total: 0, count: 0 }
  const utilidad  = ingresos.total - egresos.total
  const cfdiData  = [
    { name: 'Vigentes',   value: ingresos.vigentes  },
    { name: 'Cancelados', value: ingresos.cancelados },
  ]

  return (
    <div className="space-y-6">

      {/* ── Fila 1: KPIs principales ─────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos del mes"  skeleton={loading} value={MXN(ingresos.total)} color="blue"    icon={<IconIngresos />} />
        <KpiCard label="Egresos del mes"   skeleton={loading} value={MXN(egresos.total)}  color="rose"    icon={<IconEgresos />} />
        <KpiCard label="Utilidad estimada" skeleton={loading} value={MXN(utilidad)}       color={utilidad >= 0 ? 'emerald' : 'rose'} sub="Ingresos − Egresos" icon={<IconUtilidad />} />
        <KpiCard label="CFDIs emitidos"    skeleton={loading} value={String(ingresos.count)} color="slate" sub={`${ingresos.vigentes} vigentes · ${ingresos.cancelados} cancelados`} icon={<IconCFDI />} />
      </div>

      {/* ── Fila 2: KPIs fiscales + estado CFDIs ─────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="ISR estimado"   skeleton={loading} value={MXN(ingresos.isrEstimado ?? 0)} sub={ingresos.regimenLabel || 'Provisional mensual'} color="amber"  icon={<IconISR />} />
        <KpiCard label="IVA trasladado" skeleton={loading} value={MXN(ingresos.ivaTotal)}          sub="IVA cargado a tus clientes"                     color="violet" icon={<IconIVA />} />

        {/* Mini donut CFDIs */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="h-[64px] w-[64px] shrink-0">
            {loading ? (
              <div className="h-full w-full rounded-full bg-slate-100 dark:bg-zinc-800 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cfdiData} innerRadius={22} outerRadius={32} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {cfdiData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2">CFDIs por estado</p>
            <div className="flex gap-4">
              <div>
                <p className="text-xl font-black text-blue-500 dark:text-blue-400 leading-none">{ingresos.vigentes}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <p className="text-xs text-slate-400 dark:text-zinc-500">Vigentes</p>
                </div>
              </div>
              <div>
                <p className="text-xl font-black text-rose-500 dark:text-rose-400 leading-none">{ingresos.cancelados}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <p className="text-xs text-slate-400 dark:text-zinc-500">Cancelados</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fila 3: Ingresos y Egresos por contraparte ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Ingresos por cliente" subtitle={`Top 5 · ${periodo}`}>
          {loading ? (
            <div className="h-[210px] flex items-center justify-center">
              <div className="h-4 w-32 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ) : !data?.topClientes?.length ? (
            <EmptyChart label="Sin datos para este periodo" />
          ) : (
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.topClientes} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" width={148} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} {...barProps} />
                  <Bar dataKey="monto" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Egresos por proveedor" subtitle={`Top 5 · ${periodo}`}>
          {loading ? (
            <div className="h-[210px] flex items-center justify-center">
              <div className="h-4 w-32 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ) : !data?.topProveedores?.length ? (
            <EmptyChart label="Sin datos para este periodo" />
          ) : (
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.topProveedores} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" width={148} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} {...barProps} />
                  <Bar dataKey="monto" fill="#f43f5e" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Fila 4: Principales ingresos y gastos ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Principales ingresos" subtitle={`Por concepto · ${periodo}`}>
          {loading ? (
            <div className="h-[190px] flex items-center justify-center">
              <div className="h-4 w-32 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ) : !data?.topConceptosIngresos?.length ? (
            <EmptyChart label="Sin datos para este periodo" />
          ) : (
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.topConceptosIngresos} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="concepto" width={148} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} {...barProps} />
                  <Bar dataKey="monto" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Principales gastos" subtitle={`Por concepto · ${periodo}`}>
          {loading ? (
            <div className="h-[190px] flex items-center justify-center">
              <div className="h-4 w-32 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ) : !data?.topConceptosEgresos?.length ? (
            <EmptyChart label="Sin datos para este periodo" />
          ) : (
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.topConceptosEgresos} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="concepto" width={148} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} {...barProps} />
                  <Bar dataKey="monto" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

    </div>
  )
}
