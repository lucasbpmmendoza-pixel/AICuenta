'use client'

import { useState, useEffect, useRef } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import DashboardFooter from './DashboardFooter'
import MicButton from './MicButton'
import FreemiumOverlayScreen from './FreemiumOverlayScreen'
import { useAuth } from './AuthProvider'
import { readSelectedRfc, saveSelectedRfc } from '@/lib/rfc-selection'
import {
  FINDOC_CHAT_KEY,
  loadChatMessages,
  saveChatMessages,
  setChatGenerating,
  isChatGenerating,
} from '@/lib/chat-persistence'
import { pushLocalNotification } from '@/lib/local-notifications'

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

function extractExcelDownloadUrl(text: string): string | null {
  const match = text.match(/(?:sandbox:)?(\/api\/chat\/export\/[a-zA-Z0-9-]+)/)
  if (match?.[1]) return match[1]

  const legacy = text.match(/(?:sandbox:)?(\/api\/chat-docs\/export\/[a-zA-Z0-9-]+)/)
  return legacy?.[1] ?? null
}

function stripExcelUrlFromMessage(text: string): string {
  return text
    .replace(/\(\s*sandbox:\/api\/chat\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/\(\s*\/api\/chat\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/sandbox:\/api\/chat\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\/api\/chat\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\(\s*sandbox:\/api\/chat-docs\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/\(\s*\/api\/chat-docs\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/sandbox:\/api\/chat-docs\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\/api\/chat-docs\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  const excelUrl = !isUser ? extractExcelDownloadUrl(msg.content) : null
  const visibleContent = !isUser ? stripExcelUrlFromMessage(msg.content) : msg.content

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 text-xs font-bold">
          AI
        </div>
      )}
      <div className="max-w-[80%]">
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
            isUser
              ? 'bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 rounded-br-sm'
              : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded-bl-sm shadow-sm',
          ].join(' ')}
        >
          {visibleContent}
        </div>
        {excelUrl && (
          <a
            href={excelUrl}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100"
          >
            Descargar Excel
          </a>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-bold">
          Tú
        </div>
      )}
    </div>
  )
}

const CHAT_HINT_KEY = 'aicuenta_chat_first_visit'

export default function ChatbotView({ session, accountType }: Props) {
  const { user } = useAuth()
  const isFreemium = !session.isDemo && Boolean(user?.isFreemium)
  const now = startOfDay(new Date())
  const fixedDateFrom = new Date(now.getFullYear(), 0, 1)
  const fixedDateTo = addDays(now, 1)

  const [rfcs,        setRfcs]        = useState<RfcOption[]>([])
  const [selectedRfc, setSelectedRfc] = useState<string>('')

  const [messages,    setMessages]    = useState<Message[]>([])
  const [hydrated,    setHydrated]    = useState(false)
  const [bgGenerating, setBgGenerating] = useState(false)
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [showChatPulse, setShowChatPulse] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cargar RFCs
  useEffect(() => {
    fetch('/api/rfcs').then(r => r.json()).then(d => {
      const list: RfcOption[] = d.rfcs ?? []
      setRfcs(list)
      if (list.length === 0) return
      const storedRfc = readSelectedRfc()
      const existsInList = storedRfc && list.some(r => r.rfc === storedRfc)
      const nextRfc = existsInList ? storedRfc : list[0].rfc
      setSelectedRfc(nextRfc)
    }).catch(() => {})
  }, [])

  // First-visit chat pulse
  useEffect(() => {
    if (typeof window === 'undefined') return
    const visited = localStorage.getItem(CHAT_HINT_KEY)
    if (!visited) {
      setShowChatPulse(true)
      localStorage.setItem(CHAT_HINT_KEY, 'true')
    }
  }, [])

  // Auto-hide pulse after 30s
  useEffect(() => {
    if (!showChatPulse) return
    const timer = setTimeout(() => setShowChatPulse(false), 30000)
    return () => clearTimeout(timer)
  }, [showChatPulse])

  function dismissChatPulse() {
    setShowChatPulse(false)
  }

  useEffect(() => {
    if (!selectedRfc) return
    saveSelectedRfc(selectedRfc)
  }, [selectedRfc])

  // Auto-scroll al fondo
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Restaurar la conversación guardada (sobrevive al navegar entre páginas).
  // Si una respuesta sigue generándose en segundo plano, se va leyendo del
  // almacenamiento hasta que termina, para que se actualice sola al volver.
  useEffect(() => {
    // Hidratación desde localStorage (almacén externo) al montar: intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadChatMessages(FINDOC_CHAT_KEY))
    setHydrated(true)

    if (!isChatGenerating(FINDOC_CHAT_KEY)) return
    setBgGenerating(true)
    const startedAt = Date.now()
    const interval = setInterval(() => {
      setMessages(loadChatMessages(FINDOC_CHAT_KEY))
      if (!isChatGenerating(FINDOC_CHAT_KEY) || Date.now() - startedAt > 180_000) {
        setBgGenerating(false)
        clearInterval(interval)
      }
    }, 400)
    return () => clearInterval(interval)
  }, [])

  // Guardar la conversación en cada cambio (solo después de restaurar y mientras
  // no esté siguiendo una generación de fondo, que escribe ella misma).
  useEffect(() => {
    if (!hydrated || bgGenerating) return
    saveChatMessages(FINDOC_CHAT_KEY, messages)
  }, [messages, hydrated, bgGenerating])

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || bgGenerating || !selectedRfc) return

    dismissChatPulse()

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)
    // Marca la generación y guarda la pregunta de inmediato, por si el usuario
    // navega antes de que llegue el primer fragmento de respuesta.
    setChatGenerating(FINDOC_CHAT_KEY, true)
    saveChatMessages(FINDOC_CHAT_KEY, history)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfc: selectedRfc,
          dateFrom: toDateStr(fixedDateFrom),
          dateTo:   toDateStr(fixedDateTo),
          messages: history,
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        const next: Message[] = [...history, { role: 'assistant', content: `⚠️ ${err.error ?? 'Error al conectar con el asistente.'}` }]
        setMessages(next)
        saveChatMessages(FINDOC_CHAT_KEY, next)
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        // Se calcula desde `history` (no desde `prev`) para escribir también en
        // almacenamiento: así la respuesta sigue guardándose aunque el usuario
        // haya navegado a otra página y este componente ya esté desmontado.
        const next: Message[] = [...history, { role: 'assistant', content: acc }]
        setMessages(next)
        saveChatMessages(FINDOC_CHAT_KEY, next)
      }

      // Si el usuario ya navegó a otra página, avísale que la respuesta está lista.
      if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard/chat') {
        pushLocalNotification({
          title: 'FinDoc terminó de responder',
          body: 'Tu respuesta ya está lista. Toca para verla.',
          type: 'success',
          link: '/dashboard/chat',
        })
      }
    } catch {
      const next: Message[] = [...history, { role: 'assistant', content: '⚠️ Error de conexión. Intenta de nuevo.' }]
      setMessages(next)
      saveChatMessages(FINDOC_CHAT_KEY, next)
    } finally {
      setChatGenerating(FINDOC_CHAT_KEY, false)
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

  const selectedRfcObj = rfcs.find(r => r.rfc === selectedRfc)
  const rfcDisplay = selectedRfcObj?.alias ?? selectedRfc

  // `busy` cubre tanto el envío activo como seguir una respuesta que se está
  // generando en segundo plano (al volver a la página).
  const busy = sending || bgGenerating
  const waitingForReply =
    busy &&
    (messages.length === 0 ||
      messages[messages.length - 1].role === 'user' ||
      messages[messages.length - 1].content === '')

  const canSend = !!selectedRfc && !!input.trim() && !busy

  if (isFreemium) {
    return (
      <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
        <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
        <FreemiumOverlayScreen featureName="FinDoc" description="Pregunta cualquier cosa sobre tus CFDIs con IA. Disponible en planes de pago." />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
    <main className="flex-1 min-w-0 flex flex-col lg:ml-60">
        <div className="lg:hidden h-14" />

        {/* ── Header ── */}
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">FinDoc</h1>
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
                      {r.alias ?? r.rfc}
                    </option>
                  ))}
                </select>
              ) : selectedRfc ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide">
                  {rfcDisplay}
                </span>
              ) : null}
            </div>
          </div>
        </div>

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
                  Pregúntame sobre tus facturas. Puedo analizar ingresos,
                  egresos, proveedores, impuestos y más.
                </p>
              </div>
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
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}

          {/* Indicador de escritura */}
          {waitingForReply && (
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
          {selectedRfc && (
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-2 px-1">
              Contexto: RFC <span className="font-semibold">{rfcDisplay}</span> · Acumulado del año actual
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!selectedRfc || busy}
              placeholder={
                !selectedRfc
                  ? 'Selecciona un RFC primero…'
                  : 'Escribe tu pregunta… (Enter para enviar, Shift+Enter para salto de línea)'
              }
              rows={2}
              className={`flex-1 resize-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7b6fe8] dark:focus:ring-[#91EB78] transition disabled:opacity-50 ${showChatPulse ? 'textarea-wave-chat' : ''}`}
            />
            <MicButton
              variant="indigo"
              disabled={!selectedRfc || busy}
              onTranscript={(text) => {
                dismissChatPulse()
                setInput((prev) => (prev ? `${prev.trimEnd()} ${text}` : text))
                textareaRef.current?.focus()
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#7b6fe8] hover:bg-[#6a5fd4] dark:bg-[#91EB78] dark:hover:bg-[#7dd66a] text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {busy ? (
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
