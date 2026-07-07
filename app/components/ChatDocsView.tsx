'use client'

import { useEffect, useRef, useState } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import DashboardFooter from './DashboardFooter'
import MicButton from './MicButton'
import CedulaFiscalUploadModal from './CedulaFiscalUploadModal'
import {
  FISCALGPT_CHAT_KEY,
  loadChatMessages,
  saveChatMessages,
  setChatGenerating,
  isChatGenerating,
} from '@/lib/chat-persistence'
import { pushLocalNotification } from '@/lib/local-notifications'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
}

function extractExcelDownloadUrl(text: string): string | null {
  const match = text.match(/(?:sandbox:)?(\/api\/chat-docs\/export\/[a-zA-Z0-9-]+)/)
  return match ? match[0] : null
}

function stripExcelUrlFromMessage(text: string): string {
  return text
    .replace(/\(\s*sandbox:\/api\/chat-docs\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/\(\s*\/api\/chat-docs\/export\/[a-zA-Z0-9-]+\s*\)/g, '')
    .replace(/sandbox:\/api\/chat-docs\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\/api\/chat-docs\/export\/[a-zA-Z0-9-]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const excelUrl = !isUser ? extractExcelDownloadUrl(msg.content) : null
  const visibleContent = !isUser ? stripExcelUrlFromMessage(msg.content) : msg.content

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
          DOC
        </div>
      )}
      <div className="max-w-[85%]">
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
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            Descargar Excel
          </a>
        )}
    </div>
  </div>
  )
}

const CHAT_DOCS_HINT_KEY = 'aicuenta_chat_docs_first_visit'
interface RfcOption {
  id: string
  rfc: string
  alias: string | null
}

const CHAT_DOCS_RFC_KEY = 'aicuenta_chat_docs_active_rfc'

export default function ChatDocsView({ session, accountType }: Props) {
  const isDemo = !!session.isDemo
  const [messages, setMessages] = useState<Message[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [bgGenerating, setBgGenerating] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showChatPulse, setShowChatPulse] = useState(false)
  const [showCedulaModal, setShowCedulaModal] = useState(false)
  const [rfcs, setRfcs] = useState<RfcOption[]>([])
  const [rfcsLoading, setRfcsLoading] = useState(true)
  const [activeRfc, setActiveRfc] = useState<string>('')

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Restaurar la conversación guardada (sobrevive al navegar entre páginas).
  // Si una respuesta sigue generándose en segundo plano, se va leyendo del
  // almacenamiento hasta que termina, para que se actualice sola al volver.
  useEffect(() => {
    // Hidratación desde localStorage (almacén externo) al montar: intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadChatMessages(FISCALGPT_CHAT_KEY))
    setHydrated(true)

    if (!isChatGenerating(FISCALGPT_CHAT_KEY)) return
    setBgGenerating(true)
    const startedAt = Date.now()
    const interval = setInterval(() => {
      setMessages(loadChatMessages(FISCALGPT_CHAT_KEY))
      if (!isChatGenerating(FISCALGPT_CHAT_KEY) || Date.now() - startedAt > 180_000) {
        setBgGenerating(false)
        clearInterval(interval)
      }
    }, 400)
    return () => clearInterval(interval)
  }, [])

  // Guardar la conversación en cada cambio (tras restaurar y mientras no se esté
  // siguiendo una generación de fondo, que escribe ella misma).
  useEffect(() => {
    if (!hydrated || bgGenerating) return
    saveChatMessages(FISCALGPT_CHAT_KEY, messages)
  }, [messages, hydrated, bgGenerating])

    useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/rfcs')
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        const list: RfcOption[] = Array.isArray(json.rfcs)
          ? json.rfcs.map((r: { id: string; rfc: string; alias: string | null }) => ({
              id: r.id,
              rfc: r.rfc,
              alias: r.alias ?? null,
            }))
          : []
        setRfcs(list)
        const persisted = typeof window !== 'undefined' ? localStorage.getItem(CHAT_DOCS_RFC_KEY) : null
        const match = persisted && list.find((r) => r.rfc.toUpperCase() === persisted.toUpperCase())
        if (match) {
          setActiveRfc(match.rfc.toUpperCase())
        } else if (list.length === 1) {
          setActiveRfc(list[0].rfc.toUpperCase())
        }
      } catch {
        // silencioso: el chat sigue funcionando sin RFC seleccionado
      } finally {
        if (!cancelled) setRfcsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleRfcChange(value: string) {
    setActiveRfc(value)
    if (typeof window !== 'undefined') {
      if (value) localStorage.setItem(CHAT_DOCS_RFC_KEY, value)
      else localStorage.removeItem(CHAT_DOCS_RFC_KEY)
    }
  }

  // First-visit chat pulse
  useEffect(() => {
    if (typeof window === 'undefined') return
    const visited = localStorage.getItem(CHAT_DOCS_HINT_KEY)
    if (!visited) {
      setShowChatPulse(true)
      localStorage.setItem(CHAT_DOCS_HINT_KEY, 'true')
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

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || bgGenerating || isDemo) return

    dismissChatPulse()

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]

    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)
    // Marca la generación y guarda la pregunta de inmediato, por si el usuario
    // navega antes de que llegue el primer fragmento de respuesta.
    setChatGenerating(FISCALGPT_CHAT_KEY, true)
    saveChatMessages(FISCALGPT_CHAT_KEY, history)

    try {
      const res = await fetch('/api/chat-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, rfc: activeRfc || undefined }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        const next: Message[] = [...history, { role: 'assistant', content: `Error: ${err.error ?? 'No se pudo consultar el asistente.'}` }]
        setMessages(next)
        saveChatMessages(FISCALGPT_CHAT_KEY, next)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        // Calculado desde `history` para poder guardarlo en almacenamiento: la
        // respuesta sigue escribiéndose aunque este componente ya esté desmontado.
        const next: Message[] = [...history, { role: 'assistant', content: acc }]
        setMessages(next)
        saveChatMessages(FISCALGPT_CHAT_KEY, next)
      }

      // Si el usuario ya navegó a otra página, avísale que la respuesta está lista.
      if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard/chat-docs') {
        pushLocalNotification({
          title: 'FiscalGPT terminó de responder',
          body: 'Tu respuesta ya está lista. Toca para verla.',
          type: 'success',
          link: '/dashboard/chat-docs',
        })
      }
    } catch {
      const next: Message[] = [...history, { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' }]
      setMessages(next)
      saveChatMessages(FISCALGPT_CHAT_KEY, next)
    } finally {
      setChatGenerating(FISCALGPT_CHAT_KEY, false)
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

  // `busy` cubre tanto el envío activo como seguir una respuesta que se está
  // generando en segundo plano (al volver a la página).
  const busy = sending || bgGenerating
  const waitingForReply =
    busy &&
    (messages.length === 0 ||
      messages[messages.length - 1].role === 'user' ||
      messages[messages.length - 1].content === '')

  const canSend = !!input.trim() && !busy && !isDemo

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
      <main className="flex-1 min-w-0 flex flex-col lg:ml-60">
        <div className="lg:hidden h-14" />
        <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Asistente Documental IA</h1>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                Consulta documentos internos con busqueda inteligente
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <label htmlFor="chat-docs-rfc" className="text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                  RFC
                </label>
                <select
                  id="chat-docs-rfc"
                  value={activeRfc}
                  onChange={(e) => handleRfcChange(e.target.value)}
                  disabled={rfcsLoading || rfcs.length === 0}
                  title={
                    rfcsLoading
                      ? 'Cargando tus RFCs...'
                      : rfcs.length === 0
                        ? 'No tienes RFCs registrados en tu cuenta'
                        : 'Al elegir un RFC, el asistente tomará su cédula como contexto'
                  }
                  className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {rfcsLoading ? 'Cargando...' : rfcs.length === 0 ? 'Sin RFCs' : 'Sin contexto'}
                  </option>
                  {rfcs.map((r) => (
                    <option key={r.id} value={r.rfc.toUpperCase()}>
                      {r.rfc.toUpperCase()}
                      {r.alias ? ` — ${r.alias}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => !session.isDemo && setShowCedulaModal(true)}
                disabled={session.isDemo}
                aria-disabled={session.isDemo}
                title={session.isDemo ? 'Disponible solo con sesión activa. Inicia sesión para usar esta función.' : 'Subir cédula fiscal'}
                className={[
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                  session.isDemo
                    ? 'border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                    : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
                ].join(' ')}
              >
                {session.isDemo ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                )}
                Subir cédula fiscal
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white text-2xl font-black shadow-lg">
                DOC
              </div>
              <div>
                <p className="text-base font-bold text-slate-700 dark:text-zinc-200">
                  Asistente de documentos AIcuenta
                </p>
                <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1 max-w-md">
                  Pregunta sobre manuales, políticas, lineamientos o cualquier documento cargado en la base de conocimiento.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  '¿Qué categorías de documentos hay disponibles?',
                  'Resumen del documento de políticas contables',
                  '¿Qué dice el manual sobre conciliación bancaria?',
                  'Muéstrame los lineamientos de facturación electrónica',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 transition"
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

          {waitingForReply && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">DOC</div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-4 py-3 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 backdrop-blur-sm px-4 py-3">
          {isDemo ? (
            <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              En modo demo puedes explorar FiscalGPT, pero no enviar mensajes.{' '}
              <a href="/register" className="font-semibold underline hover:no-underline">Crea una cuenta gratis</a>{' '}
              para chatear con el asistente.
            </div>
          ) : activeRfc ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-2 px-1 font-medium">
              Contexto activo: cédula fiscal del RFC <span className="font-mono font-bold">{activeRfc}</span>.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-2 px-1">
              Selecciona un RFC arriba para que el asistente use su cédula fiscal como contexto.
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy || isDemo}
              placeholder={
                isDemo
                  ? 'Inicia sesión para chatear con FiscalGPT...'
                  : 'Escribe tu pregunta... (Enter para enviar, Shift+Enter para salto de línea)'
              }
              rows={2}
              className={`flex-1 resize-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition disabled:opacity-50 ${showChatPulse ? 'textarea-wave-docs' : ''}`}
            />
            <MicButton
              variant="emerald"
              disabled={busy || isDemo}
              onTranscript={(text) => {
                dismissChatPulse()
                setInput((prev) => (prev ? `${prev.trimEnd()} ${text}` : text))
                textareaRef.current?.focus()
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
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
      {showCedulaModal && (
        <CedulaFiscalUploadModal
          onClose={() => setShowCedulaModal(false)}
          onSuccess={(rfc, titulo) => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Cédula fiscal guardada y asociada al RFC ${rfc}.\n\n${titulo}\n\nYa puedes preguntarme por su domicilio fiscal, régimen, obligaciones, situación, etc.`,
              },
            ])
          }}
        />
      )}
    </div>
  )
}
