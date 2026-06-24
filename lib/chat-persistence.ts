// Persistencia de conversaciones de chat (FinDoc / FiscalGPT) en localStorage.
//
// Objetivo: que la conversación NO se pierda al navegar entre páginas y que,
// si una respuesta se está generando, siga escribiéndose en segundo plano para
// que al volver a la página ya esté (o se termine de cargar sola).

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Llaves de almacenamiento (compartidas con el Sidebar para limpiarlas al cerrar sesión)
export const FINDOC_CHAT_KEY = 'aicuenta_chat_messages'
export const FISCALGPT_CHAT_KEY = 'aicuenta_chat_docs_messages'

const GEN_SUFFIX = ':generating'
// Si una bandera de "generando" queda colgada (p. ej. se cerró la pestaña a
// media respuesta), se considera obsoleta pasado este tiempo.
const STALE_MS = 150_000

// Quita una burbuja final del asistente que quedó vacía (placeholder mientras
// se esperaba la respuesta). Evita mostrar globos vacíos.
function stripTrailingEmptyAssistant(msgs: ChatMessage[]): ChatMessage[] {
  const last = msgs[msgs.length - 1]
  if (last && last.role === 'assistant' && last.content === '') return msgs.slice(0, -1)
  return msgs
}

export function loadChatMessages(key: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const clean = parsed.filter(
      (m): m is ChatMessage =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
    return stripTrailingEmptyAssistant(clean)
  } catch {
    return []
  }
}

export function saveChatMessages(key: string, msgs: ChatMessage[]): void {
  if (typeof window === 'undefined') return
  try {
    const clean = stripTrailingEmptyAssistant(msgs)
    if (clean.length) localStorage.setItem(key, JSON.stringify(clean))
    else localStorage.removeItem(key)
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.) — se ignora
  }
}

export function clearChatMessages(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
    localStorage.removeItem(key + GEN_SUFFIX)
  } catch {}
}

export function setChatGenerating(key: string, generating: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (generating) localStorage.setItem(key + GEN_SUFFIX, String(Date.now()))
    else localStorage.removeItem(key + GEN_SUFFIX)
  } catch {}
}

// Hay una respuesta generándose en segundo plano (y la bandera no está obsoleta).
export function isChatGenerating(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(key + GEN_SUFFIX)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    if (Date.now() - ts > STALE_MS) {
      localStorage.removeItem(key + GEN_SUFFIX)
      return false
    }
    return true
  } catch {
    return false
  }
}
