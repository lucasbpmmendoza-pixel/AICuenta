'use client'

import { useState, useCallback, useRef } from 'react'

const MAX_IMAGES = 3
const MAX_BYTES  = 2 * 1024 * 1024 // 2 MB por imagen

interface ImageAttach { name: string; dataUrl: string }

export default function SoporteView() {
  const [subject, setSubject]   = useState('')
  const [message, setMessage]   = useState('')
  const [sending, setSending]   = useState(false)
  const [result,  setResult]    = useState<{ ok: boolean; text: string } | null>(null)
  const [images,  setImages]    = useState<ImageAttach[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef            = useRef<HTMLInputElement>(null)

  // ── helpers ────────────────────────────────────────────────────────────────
  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    const errors: string[] = []
    setImages(prev => {
      let next = [...prev]
      for (const file of list) {
        if (next.length >= MAX_IMAGES) { errors.push(`Máximo ${MAX_IMAGES} imágenes.`); break }
        if (file.size > MAX_BYTES)     { errors.push(`"${file.name}" supera 2 MB.`); continue }
        const reader = new FileReader()
        reader.onload = () => setImages(p => p.length < MAX_IMAGES
          ? [...p, { name: file.name, dataUrl: reader.result as string }]
          : p)
        reader.readAsDataURL(file)
      }
      if (errors.length) setResult({ ok: false, text: errors[0] })
      return next
    })
  }

  function removeImage(i: number) {
    setImages(prev => prev.filter((_, idx) => idx !== i))
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imgFiles = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean) as File[]
    if (imgFiles.length) addFiles(imgFiles)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [])

  // ── submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setSending(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          images: images.map(img => ({
            name:    img.name,
            data:    img.dataUrl.split(',')[1],   // solo base64, sin prefijo
            mimeType: img.dataUrl.split(';')[0].replace('data:', ''),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? 'Error al enviar. Intenta de nuevo.' })
      } else {
        setResult({ ok: true, text: 'Tu mensaje fue enviado. Te responderemos pronto.' })
        setSubject('')
        setMessage('')
        setImages([])
      }
    } catch {
      setResult({ ok: false, text: 'Error de red. Intenta de nuevo.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top padding for mobile bar */}
      <div className="lg:hidden h-14" />

      {/* Page header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-6 py-5 backdrop-blur-sm">
        <h1 className="text-lg font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Soporte</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
          Envíanos un mensaje y te responderemos a la brevedad.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Form card */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold  text-[#7B6FE8] dark:text-[#91eb78]">Nuevo mensaje</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Describe tu problema o pregunta con el mayor detalle posible.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" onPaste={handlePaste}>
              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Asunto
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={160}
                  placeholder="Ej. No puedo subir mis archivos .CER"
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>

              {/* Message */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Mensaje
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={6}
                  maxLength={4000}
                  placeholder="Describe tu situación con detalle..."
                  className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                />
                <p className="text-right text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  {message.length} / 4000
                </p>
              </div>

              {/* ── Image attachments ── */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Capturas / imagenes <span className="normal-case font-normal">(opcional, max {MAX_IMAGES})</span>
                </label>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={[
                    'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 cursor-pointer transition-colors select-none',
                    dragOver
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-300 dark:border-zinc-600 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-zinc-800/50',
                  ].join(' ')}
                >
                  <svg className="h-6 w-6 text-slate-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 text-center">
                    Arrastra una imagen, pega con <kbd className="rounded bg-slate-200 dark:bg-zinc-700 px-1 py-0.5 font-mono text-[10px]">Ctrl+V</kbd> o haz clic para seleccionar
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500">PNG, JPG, WEBP — max 2 MB c/u</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
                />

                {/* Thumbnails */}
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {images.map((img, i) => (
                      <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Eliminar imagen"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {result && (
                <div className={[
                  'rounded-lg px-4 py-3 text-sm font-medium',
                  result.ok
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                ].join(' ')}>
                  {result.text}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
              >
                {sending ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </form>
          </div>

          {/* Info card */}
          <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-6 py-4">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                Nuestro equipo suele responder en menos de 24 horas en días hábiles.
                Recibirás la respuesta en el correo de tu cuenta.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
