'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { JWTPayload } from "@/lib/auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import DashboardFooter from "./DashboardFooter";
import DashboardCharts, { type DashboardData } from "./DashboardCharts";
import { useAuth } from './AuthProvider'
import FreemiumHistoryBanner from './FreemiumHistoryBanner'
import { readSelectedRfc, saveSelectedRfc } from '@/lib/rfc-selection'
import { readDemoClientRfc } from '@/lib/demo-cuadros'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface RfcOption { id: string; rfc: string; alias: string | null }

interface Props {
  session: JWTPayload;
  accountType: "single" | "multi";
}

export default function DashboardView({ session, accountType }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const isFreemium = !session.isDemo && Boolean(user?.isFreemium)
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
  }, [session.isDemo])

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
    if (selectedRfc) fetchData(selectedRfc, year, month)
  }, [selectedRfc, year, month, fetchData])

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

          {isFreemium && <FreemiumHistoryBanner />}

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
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-deep-light-500"
                >
                  {rfcs.map(r => <option key={r.rfc} value={r.rfc}>{r.alias ?? r.rfc}</option>)}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-deep-light-50 dark:bg-deep-light-light-900/30 px-3 py-1 text-xs font-bold text-deep-light-700 dark:text-deep-light-300 tracking-wide">
                  {selectedRfc}
                </span>
              ) : null}

              {/* Navegador de mes — freemium queda fijo al mes actual */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-1">
                {!isFreemium && (
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                )}
                <span className="px-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 min-w-[130px] text-center">
                  {MESES[month - 1]} {year}
                </span>
                {!isFreemium && (
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
              <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">Sin RFCs registrados</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Agrega un RFC en la sección RFCs para ver el dashboard.</p>
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
            <DashboardCharts data={data} loading={loading} mes={MESES[month - 1]} anio={year} selectedRfc={selectedRfc} />
          )}
        </div>
        <DashboardFooter />
      </main>
    </div>
  );
}
