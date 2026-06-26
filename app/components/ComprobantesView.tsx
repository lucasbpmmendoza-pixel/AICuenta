'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

interface Comprobante {
  id: number
  remitente_nombre: string | null
  remitente_telefono: string | null
  banco: string | null
  fecha: string | null
  monto: number | null
  folio: string | null
  concepto: string | null
  referencia: string | null
  clave_rastreo: string | null
  beneficiario: string | null
  cuenta_destino: string | null
  fuente: string | null
  created_at: string
}

// ── Status pill ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: 'Desconectado',
  connecting:   'Conectando...',
  qr:           'Escanea el QR',
  connected:    'Conectado',
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  connecting:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  qr:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  connected:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  disconnected: 'bg-red-500',
  connecting:   'bg-yellow-500 animate-pulse',
  qr:           'bg-blue-500 animate-pulse',
  connected:    'bg-green-500',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ComprobantesView() {
  const { user } = useAuth()
  const router = useRouter()
  const isFreemium = Boolean(user?.isFreemium)
  const [status, setStatus]         = useState<ConnectionStatus>('disconnected')
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const [rows, setRows]   = useState<Comprobante[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState(false)

  const esRef = useRef<EventSource | null>(null)

  // ── Load status on mount ──────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then(r => r.json())
      .then(d => {
        setStatus(d.status)
        if (d.qrDataUrl) setQrDataUrl(d.qrDataUrl)
      })
      .catch(() => {})
  }, [])

  // ── Load comprobantes ─────────────────────────────────────────────────────

  const loadComprobantes = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/comprobantes?page=${p}&limit=50`)
      const d = await r.json()
      setRows(d.rows ?? [])
      setTotal(d.total ?? 0)
      setPage(p)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadComprobantes(1) }, [loadComprobantes])

  // ── Connect via SSE ───────────────────────────────────────────────────────

  function openSSE() {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const es = new EventSource('/api/whatsapp/connect')
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data)
        if (evt.type === 'status') {
          setStatus(evt.status)
          setConnecting(false)
          if (evt.status === 'connected') {
            setQrDataUrl(null)
            es.close()
            esRef.current = null
            loadComprobantes(1)
          }
        }
        if (evt.type === 'qr') {
          setQrDataUrl(evt.dataUrl)
          setStatus('qr')
          setConnecting(false)
        }
      } catch { /* ignore */ }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      setConnecting(false)
      if (!qrDataUrl) setStatus('disconnected')
    }
  }

  function handleConnect() {
    setConnecting(true)
    openSSE()
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      setStatus('disconnected')
      setQrDataUrl(null)
    } catch { /* ignore */ }
    finally { setDisconnecting(false) }
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => () => { esRef.current?.close() }, [])

  // ── Export Excel ──────────────────────────────────────────────────────

  async function handleExportExcel() {
    setExporting(true)
    try {
      const res = await fetch('/api/export/comprobantes')
      if (!res.ok) throw new Error('Error al exportar')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `Comprobantes_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setExporting(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isActive = status === 'connected' || status === 'qr' || status === 'connecting'

  if (isFreemium) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EBE9FB] dark:bg-[#5E6957]">
            <svg className="h-8 w-8 text-[#7B6FE8] dark:text-[#91EB78]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Scan Bot esta bloqueado</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
            Registra comprobantes de pago automaticamente desde WhatsApp. Disponible en planes de pago.
          </p>
          <button
            onClick={() => router.push('/dashboard/suscripcion')}
            className="mt-6 w-full rounded-xl bg-[#7B6FE8] hover:bg-[#6B5FE0] dark:bg-[#91eb78] dark:hover:bg-[#83dd6a] px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 transition"
          >
            Ver planes
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 text-zinc-900 dark:text-zinc-100">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comprobantes de Pago</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Scan Bot — registra comprobantes enviados como imágenes automáticamente.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export button */}
          <button
            onClick={handleExportExcel}
            disabled={exporting || total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {exporting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 4v11" />
              </svg>
            )}
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>

          {/* Status pill */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[status]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* ── Connection card ────────────────────────────────────────────────── */}
      <div className="rounded-xl border p-5 bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">

        {/* Disconnected or connecting */}
        {(status === 'disconnected' || (status === 'connecting' && !qrDataUrl)) && (
          <div className="flex flex-col items-center gap-4 py-4">
            {/* WhatsApp icon */}
            <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-9 h-9 fill-[#25D366]">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.529 5.853L.057 23.5l5.797-1.519A11.934 11.934 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.574-.5-5.063-1.371l-.363-.215-3.44.902.918-3.355-.236-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium">Conecta tu WhatsApp</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                Vincula un número de WhatsApp para recibir comprobantes de pago automáticamente.
                Los usuarios envían una foto del comprobante y el bot lo registra en el sistema.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {connecting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.529 5.853L.057 23.5l5.797-1.519A11.934 11.934 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.574-.5-5.063-1.371l-.363-.215-3.44.902.918-3.355-.236-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
              )}
              {connecting ? 'Generando QR...' : 'Conectar WhatsApp'}
            </button>
          </div>
        )}

        {/* QR code display */}
        {(status === 'qr' || (status === 'connecting' && qrDataUrl)) && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="font-medium">Escanea este código con tu WhatsApp</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
              Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanea el QR.
            </p>
            {qrDataUrl ? (
              <div className="p-3 bg-white rounded-xl shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="WhatsApp QR" width={220} height={220} />
              </div>
            ) : (
              <div className="w-[220px] h-[220px] rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <svg className="w-8 h-8 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </div>
            )}
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Connected state */}
        {status === 'connected' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#25D366]">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.529 5.853L.057 23.5l5.797-1.519A11.934 11.934 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.574-.5-5.063-1.371l-.363-.215-3.44.902.918-3.355-.236-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">WhatsApp conectado</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  El bot está activo y procesando comprobantes en tiempo real.
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Desconectando...' : 'Desconectar'}
            </button>
          </div>
        )}
      </div>

      {/* ── Comprobantes table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="font-medium text-sm">Comprobantes registrados</h2>
            {total > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{total} en total</p>
            )}
          </div>
          <button
            onClick={() => loadComprobantes(page)}
            disabled={loading}
            className="p-1.5 rounded-md transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            title="Actualizar"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0 1 14.93-3M20 15a8 8 0 0 1-14.93 3" />
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {['Remitente','Teléfono','Banco','Fecha','Monto','Folio','Concepto','Referencia','Registrado'].map(h => (
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-400 dark:text-zinc-500 text-sm">
                    {loading ? 'Cargando...' : 'No hay comprobantes registrados aún.'}
                  </td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-3 py-2 whitespace-nowrap">{r.remitente_nombre ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{r.remitente_telefono ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.banco ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.fecha ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{fmt(r.monto)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{r.folio ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.concepto ?? ''}>{r.concepto ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{r.referencia ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} de {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => loadComprobantes(page - 1)}
                disabled={page === 1 || loading}
                className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Anterior
              </button>
              <button
                onClick={() => loadComprobantes(page + 1)}
                disabled={page * 50 >= total || loading}
                className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
