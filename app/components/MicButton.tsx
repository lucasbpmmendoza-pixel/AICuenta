'use client'

import { useEffect, useRef, useState } from 'react'

type Variant = 'indigo' | 'emerald'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  variant?: Variant
  title?: string
}

type State = 'idle' | 'recording' | 'transcribing'

const VARIANT_CLASSES: Record<Variant, { idle: string; recording: string; ring: string }> = {
  indigo: {
    idle: 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-[#EBE9FB] dark:hover:bg-[#5E6957] hover:text-[#450c7d] dark:hover:text-[#6BDA4D]',
    recording: 'border-red-300 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300',
    ring: 'focus:ring-[#7b6fe8] dark:focus:ring-[#91EB78]',
  },
  emerald: {
    idle: 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300',
    recording: 'border-red-300 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300',
    ring: 'focus:ring-emerald-500',
  },
}

function pickAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function extForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MicButton({ onTranscript, disabled, variant = 'indigo', title }: Props) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      stopTick()
      cleanupStream()
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch {}
      }
    }
  }, [])

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  function cleanupStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  async function startRecording() {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta grabación de audio.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Tu navegador no soporta MediaRecorder.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as DOMException).name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Permiso de micrófono denegado.')
      } else if (name === 'NotFoundError') {
        setError('No se detectó un micrófono.')
      } else {
        setError('No se pudo acceder al micrófono.')
      }
      return
    }

    streamRef.current = stream
    const mimeType = pickAudioMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type })
      chunksRef.current = []
      cleanupStream()
      void transcribe(blob, type)
    }

    startedAtRef.current = Date.now()
    setElapsed(0)
    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current)
    }, 250)

    recorder.start()
    setState('recording')
  }

  function stopRecording() {
    stopTick()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch {}
    }
    setState('transcribing')
  }

  async function transcribe(blob: Blob, mime: string) {
    if (blob.size === 0) {
      setState('idle')
      setError('No se grabó audio.')
      return
    }
    try {
      const form = new FormData()
      const ext = extForMime(mime)
      form.append('file', blob, `audio_${Date.now()}.${ext}`)
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'No se pudo transcribir.')
        setState('idle')
        return
      }
      const text = typeof data?.text === 'string' ? data.text.trim() : ''
      if (text) onTranscript(text)
      else setError('No se reconoció ningún audio.')
    } catch {
      setError('Error de conexión al transcribir.')
    } finally {
      setState('idle')
    }
  }

  function handleClick() {
    if (disabled) return
    if (state === 'idle') void startRecording()
    else if (state === 'recording') stopRecording()
  }

  const classes = VARIANT_CLASSES[variant]
  const isRecording = state === 'recording'
  const isBusy = state === 'transcribing'
  const buttonTitle =
    isRecording
      ? 'Haz clic para detener y enviar'
      : isBusy
        ? 'Transcribiendo…'
        : title ?? 'Dictar por voz'

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isBusy}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-pressed={isRecording}
        className={[
          'shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2',
          classes.ring,
          isRecording ? classes.recording : classes.idle,
          disabled || isBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {isBusy ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : isRecording ? (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
      </button>
      {(isRecording || error) && (
        <div className="mt-1 text-[10px] leading-tight">
          {isRecording && (
            <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">● {formatElapsed(elapsed)}</span>
          )}
          {!isRecording && error && (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          )}
        </div>
      )}
    </div>
  )
}
