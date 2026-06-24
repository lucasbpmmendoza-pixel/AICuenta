export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SendOptions {
  rfc: string
  dateFrom: string
  dateTo: string
}

interface State {
  messages: ChatMessage[]
  input: string
  sending: boolean
  activeRfc: string | null
}

const initialState: State = {
  messages: [],
  input: '',
  sending: false,
  activeRfc: null,
}

let state: State = initialState
const listeners = new Set<() => void>()
let controller: AbortController | null = null

function emit() {
  for (const l of listeners) l()
}

function setState(updater: (s: State) => State) {
  state = updater(state)
  emit()
}

export function getSnapshot(): State {
  return state
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function setInput(value: string) {
  setState((s) => ({ ...s, input: value }))
}

export function appendInput(value: string) {
  setState((s) => ({
    ...s,
    input: s.input ? `${s.input.trimEnd()} ${value}` : value,
  }))
}

export function clearConversation() {
  controller?.abort()
  controller = null
  setState((s) => ({ ...s, messages: [], sending: false, input: '' }))
}

export function setActiveRfc(rfc: string) {
  if (state.activeRfc && state.activeRfc !== rfc) {
    controller?.abort()
    controller = null
    setState(() => ({ messages: [], input: '', sending: false, activeRfc: rfc }))
    return
  }
  setState((s) => ({ ...s, activeRfc: rfc }))
}

export async function sendMessage(opts: SendOptions): Promise<void> {
  const text = state.input.trim()
  if (!text || state.sending || !opts.rfc) return

  const userMsg: ChatMessage = { role: 'user', content: text }
  const history = [...state.messages, userMsg]

  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal

  setState((s) => ({
    ...s,
    messages: [...history, { role: 'assistant', content: '' }],
    input: '',
    sending: true,
    activeRfc: opts.rfc,
  }))

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rfc: opts.rfc,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        messages: history,
      }),
      signal,
    })

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
      setState((s) => ({
        ...s,
        messages: [
          ...s.messages.slice(0, -1),
          { role: 'assistant', content: `⚠️ ${err.error ?? 'Error al conectar con el asistente.'}` },
        ],
      }))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let acc = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      acc += decoder.decode(value, { stream: true })
      setState((s) => ({
        ...s,
        messages: [...s.messages.slice(0, -1), { role: 'assistant', content: acc }],
      }))
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages.slice(0, -1),
        { role: 'assistant', content: '⚠️ Error de conexión. Intenta de nuevo.' },
      ],
    }))
  } finally {
    if (controller?.signal === signal) controller = null
    setState((s) => ({ ...s, sending: false }))
  }
}
