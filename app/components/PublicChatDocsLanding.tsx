'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  dailyLimit: number
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
          DOC
        </div>
      )}
      <div className="max-w-[88%]">
        <div
          className={[
            'whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser ? 'rounded-br-sm bg-[#1f2937] text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 shadow-sm',
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
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
          Tu
        </div>
      )}
    </div>
  )
}

export default function PublicChatDocsLanding({ dailyLimit }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitModalVisible, setLimitModalVisible] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (showLimitModal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setLimitModalVisible(true))
      })
    } else {
      setLimitModalVisible(false)
    }
  }, [showLimitModal])

  function closeLimitModal() {
    setLimitModalVisible(false)
    setTimeout(() => setShowLimitModal(false), 220)
  }

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
        const limitReached = res.status === 429 || err?.code === 'PUBLIC_LIMIT_REACHED'

        if (limitReached) {
          setMessages((prev) => prev.slice(0, -1))
          setShowLimitModal(true)
          return
        }

        const message =
          typeof err?.error === 'string'
            ? err.error
            : 'No se pudo consultar el asistente.'

        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `Error: ${message}` },
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
        { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' },
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
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {showLimitModal && (
        <div
          className={[
            'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[1px]',
            'transition-opacity duration-200',
            limitModalVisible ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          onClick={closeLimitModal}
        >
          <div
            className={[
              'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl',
              'transition-all duration-200',
              limitModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Límite alcanzado</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Necesitas una cuenta y un plan de pago</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ya usaste las {dailyLimit} consultas incluidas en modo publico. Crea tu cuenta para continuar y activar un plan premium.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Crear cuenta
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Iniciar sesión
              </Link>
            </div>

            <button
              type="button"
              onClick={closeLimitModal}
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-4 pt-4 sm:px-6">
        <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Fiscal gpt</p>
                <p className="mt-0.5 text-xs text-slate-500">Inicia sesión para acceder al modo premium.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Crear cuenta
                </Link>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white">
                  DOC
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-800">Haz una pregunta sobre documentos y criterios SAT</p>
                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    Este chat usa una base documental y puede ayudarte a ubicar lineamientos, criterios y claves SAT relevantes.
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {[
                    '¿Qué categorías de documentos tienes disponibles y cuántos hay por categoría?',
                    '¿Qué dice la Ley del IVA sobre actos o actividades gravadas?',
                    '¿Qué establece la Ley del ISR sobre ingresos acumulables?',
                    '¿Qué clave SAT recomiendas para servicios de consultoría administrativa?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}

            {sending && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">DOC</div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="mb-2 px-1 text-[11px] text-slate-500">
              Modo público con límites diarios y contexto reducido. El modo premium se habilita al iniciar sesión.
            </p>
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder="Escribe tu pregunta... (Enter para enviar, Shift+Enter para salto de línea)"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!canSend}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
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
        </section>
      </main>
    </div>
  )
}
