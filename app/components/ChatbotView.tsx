'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import NotificationBell from './NotificationBell'

interface RfcOption { id: string; rfc: string; alias: string | null }

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type Granularity = 'day' | 'week'

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const MESES_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function fmtPeriodLabel(from: Date, to: Date, gran: Granularity): string {
  if (gran === 'day') {
    return `${from.getDate()} de ${MESES_FULL[from.getMonth()]} de ${from.getFullYear()}`
  }
  const toDisplay = new Date(to.getTime() - 86_400_000) // un día antes del exclusivo
  if (from.getMonth() === toDisplay.getMonth()) {
    return `${from.getDate()}–${toDisplay.getDate()} ${MESES_FULL[from.getMonth()]} ${from.getFullYear()}`
  }
  return `${from.getDate()} ${MESES[from.getMonth()]} – ${toDisplay.getDate()} ${MESES[toDisplay.getMonth()]} ${from.getFullYear()}`
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function countLabel(n: number | null): string {
  if (n === null) return '…'
  if (n === 0) return 'Sin CFDIs'
  return `${n} CFDI${n !== 1 ? 's' : ''}`
}

// ─── Spinner inline ───────────────────────────────────────────────────────────
function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

// ─── Burbuja de mensaje ───────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 text-xs font-bold">
          AI
        </div>
      )}
      <div
        className={[
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 rounded-br-sm'
            : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded-bl-sm shadow-sm',
        ].join(' ')}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-bold">
          Tú
        </div>
      )}
    </div>
  )
}

export default function ChatbotView({ session, accountType }: Props) {
  const now = startOfDay(new Date())

  const [rfcs,        setRfcs]        = useState<RfcOption[]>([])
  const [selectedRfc, setSelectedRfc] = useState<string>('')
  const [gran,        setGran]        = useState<Granularity>('day')
  const [dateFrom,    setDateFrom]    = useState<Date>(now)
  const [count,       setCount]       = useState<number | null>(null)
  const [loadingCount,setLoadingCount]= useState(false)

  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // dateTo siempre es exclusivo — memoizado para evitar referencias nuevas en cada render
  const dateTo = useMemo(
    () => (gran === 'day' ? addDays(dateFrom, 1) : addDays(dateFrom, 7)),
    [gran, dateFrom]
  )

  const isToday    = dateFrom.getTime() === now.getTime()
  const isFuture   = dateFrom > now
  const canGoNext  = !isFuture && !(gran === 'day' && isToday)

  // Cargar RFCs
  useEffect(() => {
    fetch('/api/rfcs').then(r => r.json()).then(d => {
      const list: RfcOption[] = d.rfcs ?? []
      setRfcs(list)
      if (list.length > 0) setSelectedRfc(list[0].rfc)
    }).catch(() => {})
  }, [])

  // Contar CFDIs cuando cambia RFC o período
  const fetchCount = useCallback(async () => {
    if (!selectedRfc) return
    setCount(null)
    setLoadingCount(true)
    try {
      const res = await fetch(
        `/api/chat?rfc=${encodeURIComponent(selectedRfc)}&dateFrom=${toDateStr(dateFrom)}&dateTo=${toDateStr(dateTo)}`
      )
      if (res.ok) {
        const d = await res.json()
        setCount(d.count ?? 0)
      }
    } catch {}
    finally { setLoadingCount(false) }
  }, [selectedRfc, dateFrom, dateTo])

  useEffect(() => { fetchCount() }, [fetchCount])

  // Auto-scroll al fondo
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function prevPeriod() {
    setDateFrom(d => addDays(d, gran === 'day' ? -1 : -7))
    setMessages([])
  }

  function nextPeriod() {
    if (!canGoNext) return
    setDateFrom(d => addDays(d, gran === 'day' ? 1 : 7))
    setMessages([])
  }

  function changeGran(g: Granularity) {
    setGran(g)
    setDateFrom(now)
    setMessages([])
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || !selectedRfc || count === 0) return

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfc: selectedRfc,
          dateFrom: toDateStr(dateFrom),
          dateTo:   toDateStr(dateTo),
          messages: history,
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `⚠️ ${err.error ?? 'Error al conectar con el asistente.'}` },
        ])
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: acc }])
      }
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: '⚠️ Error de conexión. Intenta de nuevo.' },
      ])
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const periodLabel = fmtPeriodLabel(dateFrom, dateTo, gran)
  const selectedRfcObj = rfcs.find(r => r.rfc === selectedRfc)
  const rfcDisplay = selectedRfcObj?.alias
    ? `${selectedRfcObj.alias} (${selectedRfc})`
    : selectedRfc

  const countBadgeColor =
    count === null ? 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'
    : count === 0  ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    : count > 40   ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    :                'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'

  const canSend = !!selectedRfc && (count ?? 0) > 0 && !!input.trim() && !sending

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} />
    <main className="flex-1 min-w-0 flex flex-col lg:ml-60">
        <div className="lg:hidden h-14" />

        {/* ── Header ── */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Asistente Fiscal IA</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                Analiza tus CFDIs con inteligencia artificial
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">

              {/* RFC selector */}
              {rfcs.length > 1 ? (
                <select
                  value={selectedRfc}
                  onChange={e => { setSelectedRfc(e.target.value); setMessages([]) }}
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#7b6fe8]"
                >
                  {rfcs.map(r => (
                    <option key={r.rfc} value={r.rfc}>
                      {r.alias ? `${r.alias} (${r.rfc})` : r.rfc}
                    </option>
                  ))}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide">
                  {rfcDisplay}
                </span>
              ) : null}

              {/* Granularidad */}
              <div className="flex rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
                {(['day', 'week'] as Granularity[]).map(g => (
                  <button
                    key={g}
                    onClick={() => changeGran(g)}
                    className={`px-3 py-1.5 text-xs font-semibold transition ${
                      gran === g
                        ? 'bg-[#7B6FE8] text-white dark:bg-[#91eb78] dark:text-black'
                        : 'text-slate-600 hover:bg-[#EBE9FB] dark:text-zinc-400 dark:hover:bg-[#5E6957]'
                    }`}
                  >
                    {g === 'day' ? 'Día' : 'Semana'}
                  </button>
                ))}
              </div>

              {/* Navegador de período */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-1">
                <button
                  onClick={prevPeriod}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="px-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 min-w-[160px] text-center capitalize">
                  {periodLabel}
                </span>
                <button
                  onClick={nextPeriod}
                  disabled={!canGoNext}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-slate-500 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Badge de conteo */}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${countBadgeColor}`}>
                {loadingCount && <Spinner className="h-3 w-3" />}
                {countLabel(count)}
              </span>

              <NotificationBell />
            </div>
          </div>
        </div>

        {/* ── Aviso si no hay CFDIs ── */}
        {count === 0 && !loadingCount && selectedRfc && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No hay CFDIs en el período seleccionado. Navega a otro día o semana.
            </p>
          </div>
        )}

        {/* ── Área de chat ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Mensaje de bienvenida */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 text-2xl font-black shadow-lg">
                AI
              </div>
              <div>
                <p className="text-base font-bold text-slate-700 dark:text-zinc-200">
                  Asistente Fiscal AIcuenta
                </p>
                <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1 max-w-sm">
                  Pregúntame sobre tus facturas del período seleccionado. Puedo analizar ingresos,
                  egresos, proveedores, impuestos y más.
                </p>
              </div>
              {count !== null && count > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {[
                    '¿Cuál fue mi ingreso total?',
                    '¿Qué proveedores me emitieron más facturas?',
                    '¿Cuánto IVA retuvieron?',
                    'Muéstrame las 5 facturas de mayor importe',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-[#450c7d] dark:hover:text-[#6BDA4D] transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}

          {/* Indicador de escritura */}
          {sending && messages[messages.length - 1]?.content === '' && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 text-xs font-bold">AI</div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-4 py-3 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── Input ── */}
        <div className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 backdrop-blur-sm px-4 py-3">
          {count !== null && count > 0 && (
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-2 px-1">
              Contexto: <span className="font-semibold">{count} CFDI{count !== 1 ? 's' : ''}</span> del período{' '}
              <span className="font-semibold capitalize">{periodLabel}</span> · RFC {rfcDisplay}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!selectedRfc || (count ?? 0) === 0 || sending}
              placeholder={
                !selectedRfc
                  ? 'Selecciona un RFC primero…'
                  : count === 0
                  ? 'Sin CFDIs en este período — navega a otro'
                  : 'Escribe tu pregunta… (Enter para enviar, Shift+Enter para salto de línea)'
              }
              rows={2}
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7b6fe8] dark:focus:ring-[#91EB78] transition disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#7b6fe8] hover:bg-[#6a5fd4] dark:bg-[#91EB78] dark:hover:bg-[#7dd66a] text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {sending ? (
                <Spinner />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <DashboardFooter />
      </main>
    </div>
  )
}
