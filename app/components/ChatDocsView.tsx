'use client'

import { useEffect, useRef, useState } from 'react'
import type { JWTPayload } from '@/lib/auth'
import Sidebar from './Sidebar'
import DashboardFooter from './DashboardFooter'
import NotificationBell from './NotificationBell'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  session: JWTPayload
  accountType: 'single' | 'multi'
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

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
          DOC
        </div>
      )}
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-[#7b6fe8] dark:bg-[#91EB78] text-white dark:text-zinc-900 rounded-br-sm'
            : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 rounded-bl-sm shadow-sm',
        ].join(' ')}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-bold">
          Tu
        </div>
      )}
    </div>
  )
}

export default function ChatDocsView({ session, accountType }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]

    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/chat-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `Error: ${err.error ?? 'No se pudo consultar el asistente.'}` },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: acc }])
      }
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error de conexion. Intenta de nuevo.' },
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

  const canSend = !!input.trim() && !sending

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
            <NotificationBell />
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
                  Pregunta sobre manuales, politicas, lineamientos o cualquier documento cargado en la base de conocimiento.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  'Que categorias de documentos hay disponibles?',
                  'Resumen del documento de politicas contables',
                  'Que dice el manual sobre conciliacion bancaria?',
                  'Muestrame los lineamientos de facturacion electronica',
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

          {sending && messages[messages.length - 1]?.content === '' && (
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
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-2 px-1">
            Este asistente responde con base en documentos almacenados en la tabla documents.
          </p>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Escribe tu pregunta... (Enter para enviar, Shift+Enter para salto de linea)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
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
