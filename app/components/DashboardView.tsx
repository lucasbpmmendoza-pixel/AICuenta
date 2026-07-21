'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { JWTPayload } from "@/lib/auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import DashboardFooter from "./DashboardFooter";
import DashboardCharts, { type DashboardData } from "./DashboardCharts";
import FiscalHealthScore from "./FiscalHealthScore";
import { useAuth } from './AuthProvider'
import FreemiumHistoryBanner from './FreemiumHistoryBanner'
import { readSelectedRfc, saveSelectedRfc } from '@/lib/rfc-selection'
import { readDemoClientRfc, readDemoCuadroRows } from '@/lib/demo-cuadros'
import { buildDashboardFromCfdis } from '@/lib/cfdi-to-dashboard'
import type { CfdiRow } from '@/lib/cfdi-xml'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface RfcOption { id: string; rfc: string; alias: string | null }

interface Props {
  session: JWTPayload;
  accountType: "single" | "multi";
  // Modo XML: usuario con cuenta pero sin e.firma. El dashboard se arma con los
  // CFDIs que subió en "Crea tus cuadros" (localStorage), no desde la BD.
  xmlMode?: boolean;
}

export default function DashboardView({ session, accountType, xmlMode = false }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const isFreemium = !session.isDemo && Boolean(user?.isFreemium)
  // En modo XML los datos vienen de los CFDIs que subio el propio usuario, no del
  // SAT: no aplica el bloqueo de historial del freemium (esa restriccion existe
  // para gatear datos descargados de pago).
  const restrictHistory = isFreemium && !xmlMode
  const now = new Date()
  const [rfcs, setRfcs]               = useState<RfcOption[]>([])
  const [selectedRfc, setSelectedRfc] = useState<string>('')
  const [year,  setYear]              = useState(now.getFullYear())
  const [month, setMonth]             = useState(now.getMonth() + 1)
  const [data,  setData]              = useState<DashboardData | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error,   setError]           = useState<string | null>(null)
  // RFC del cliente detectado en la herramienta "Crea tus cuadros" (solo demo).
  // Su dashboard se muestra con blur como gancho para registrarse.
  const [demoClientRfc, setDemoClientRfc] = useState<string>('')

  // Cargar lista de RFCs
  useEffect(() => {
    // Modo XML: el único RFC es el detectado en "Crea tus cuadros" (sus XML).
    if (xmlMode) {
      const detected = readDemoClientRfc()
      if (detected) {
        setRfcs([{ id: 'xml-client', rfc: detected.rfc, alias: detected.nombre || detected.rfc }])
        setSelectedRfc(detected.rfc)
        // Saltar al mes mas reciente con CFDIs para que el dashboard no arranque
        // en el mes actual si el contador cargo periodos anteriores.
        const rows = readDemoCuadroRows<CfdiRow>()
        let bestY = 0, bestM = 0
        for (const r of rows) {
          if (!r.fecha || r.fecha.length < 7) continue
          const y = Number(r.fecha.slice(0, 4))
          const m = Number(r.fecha.slice(5, 7))
          if (!Number.isFinite(y) || !Number.isFinite(m)) continue
          if (y > bestY || (y === bestY && m > bestM)) { bestY = y; bestM = m }
        }
        if (bestY > 0) { setYear(bestY); setMonth(bestM) }
      } else {
        setRfcs([])
        setSelectedRfc('')
      }
      return
    }
    fetch('/api/rfcs')
      .then(r => r.json())
      .then(d => {
        let list: RfcOption[] = d.rfcs ?? []
        // En demo: si hay RFC detectado, va primero (su dashboard se muestra con
        // blur). Los RFCs de ejemplo siguen disponibles para explorar la demo.
        if (session.isDemo) {
          const detected = readDemoClientRfc()
          if (detected) {
            const ejemplos = list.filter(r => r.rfc !== detected.rfc)
            list = [{ id: 'demo-client', rfc: detected.rfc, alias: detected.nombre || detected.rfc }, ...ejemplos]
            setDemoClientRfc(detected.rfc)
          } else {
            setDemoClientRfc('')
          }
        }
        setRfcs(list)
        if (list.length === 0) return
        const storedRfc = readSelectedRfc()
        const existsInList = storedRfc && list.some(r => r.rfc === storedRfc)
        const nextRfc = existsInList ? storedRfc : list[0].rfc
        setSelectedRfc(nextRfc)
      })
      .catch(() => {})
  }, [session.isDemo, xmlMode])

  useEffect(() => {
    if (!selectedRfc) return
    saveSelectedRfc(selectedRfc)
  }, [selectedRfc])

  // Fetch datos del dashboard
  const fetchData = useCallback(async (rfc: string, y: number, m: number) => {
    if (!rfc) return
    setLoading(true)
    setData(null)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard?rfc=${encodeURIComponent(rfc)}&year=${y}&month=${m}`)
      const d = await res.json()
      if (res.ok) {
        setData(d)
      } else {
        setError(d?.error ?? 'Error al obtener datos del dashboard')
      }
    } catch (e) {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.')
      console.error('[dashboard] fetchData error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedRfc) return
    // Modo XML: se arma el dashboard con los CFDIs subidos (localStorage), sin API.
    if (xmlMode) {
      const rows = readDemoCuadroRows<CfdiRow>()
      setData(buildDashboardFromCfdis(rows, selectedRfc, year, month))
      setLoading(false)
      setError(null)
      return
    }
    fetchData(selectedRfc, year, month)
  }, [selectedRfc, year, month, fetchData, xmlMode])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year
    if (nextY > now.getFullYear() || (nextY === now.getFullYear() && nextM > now.getMonth() + 1)) return
    setMonth(nextM)
    if (month === 12) setYear(y => y + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />

    <main className="flex-1 flex flex-col lg:ml-60">
          <div className="lg:hidden h-14" />

          {restrictHistory && <FreemiumHistoryBanner />}

          {xmlMode && (
            <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-[#7B6FE8]/30 dark:border-[#91eb78]/30 bg-[#EBE9FB] dark:bg-[#5E6957]/20 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#7B6FE8] dark:text-[#91eb78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-xs text-[#450c7d] dark:text-[#91eb78] leading-relaxed">
                Estás viendo tu dashboard con los <span className="font-semibold">CFDIs que subiste</span> en Facturas.
                Configura tu <span className="font-semibold">e.firma</span> para que AICuenta descargue tus comprobantes del SAT automáticamente.
              </p>
            </div>
          )}

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">Bienvenido, {session.name}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* RFC selector */}
              {rfcs.length > 1 ? (
                <select
                  value={selectedRfc}
                  onChange={e => setSelectedRfc(e.target.value)}
                  className="w-auto [field-sizing:content] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-deep-light-500"
                >
                  {[...rfcs].sort((a, b) => (a.alias ?? a.rfc).localeCompare(b.alias ?? b.rfc, 'es', { sensitivity: 'base', numeric: true })).map(r => <option key={r.rfc} value={r.rfc}>{r.rfc === selectedRfc ? r.rfc : (r.alias ? `${r.alias} — ${r.rfc}` : r.rfc)}</option>)}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-deep-light-50 dark:bg-deep-light-light-900/30 px-3 py-1 text-xs font-bold text-deep-light-700 dark:text-deep-light-300 tracking-wide">
                  {selectedRfc}
                </span>
              ) : null}

              {/* Navegador de mes — freemium queda fijo al mes actual salvo en modo XML */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-1">
                {!restrictHistory && (
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                )}
                <span className="px-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 min-w-[130px] text-center">
                  {MESES[month - 1]} {year}
                </span>
                {!restrictHistory && (
                  <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedRfc && !loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">
                {xmlMode ? 'Aún no subes tus XML' : 'Sin RFCs registrados'}
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                {xmlMode
                  ? 'Sube tus CFDIs en Facturas para ver tu dashboard con tus datos.'
                  : 'Agrega un RFC en la sección RFCs para ver el dashboard.'}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
              <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">{error}</p>
              <button onClick={() => fetchData(selectedRfc, year, month)} className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Reintentar</button>
            </div>
          ) : session.isDemo && demoClientRfc && selectedRfc === demoClientRfc ? (
            <div className="relative">
              <div className="blur-sm pointer-events-none select-none" aria-hidden>
                <DashboardCharts data={data} loading={loading} mes={MESES[month - 1]} anio={year} selectedRfc={selectedRfc} />
              </div>
              <div className="absolute inset-0 flex items-start justify-center pt-24">
                <div className="max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 p-6 text-center shadow-xl">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Detectamos tu RFC {demoClientRfc}</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                    Regístrate gratis para ver el dashboard completo de tu RFC con tus datos reales.
                  </p>
                  <button
                    onClick={() => router.push('/register')}
                    className="mt-5 w-full rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition"
                  >
                    Crear cuenta gratis
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <DashboardCharts data={data} loading={loading} mes={MESES[month - 1]} anio={year} selectedRfc={selectedRfc} />
              <FiscalHealthScore
                ingresos={data?.ingresos.total ?? 0}
                egresos={data?.egresos.total ?? 0}
                loading={loading}
              />
            </>
          )}
        </div>
        <DashboardFooter />
      </main>
    </div>
  );
}
