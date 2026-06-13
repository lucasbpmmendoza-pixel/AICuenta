'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

interface CedulaData {
  rfc?: string
  curp?: string
  nombre?: string
  razon_social?: string
  tipo_persona?: string
  situacion_contribuyente?: string
  regimenes?: Array<{ regimen?: string; fecha_alta?: string }>
  domicilio?: {
    codigo_postal?: string
    calle?: string
    numero_exterior?: string
    colonia?: string
    municipio?: string
    estado?: string
  }
}

interface Props {
  onClose: () => void
  onSuccess: (rfc: string, titulo: string) => void
}

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'
const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp']
const MAX_BYTES = 8 * 1024 * 1024

type ViewState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'success'; rfc: string; titulo: string; data: CedulaData; updated: boolean }
  | { kind: 'error'; message: string }

function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

export default function CedulaFiscalUploadModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<ViewState>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function validateAndSet(candidate: File) {
    const ext = candidate.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTS.includes(ext)) {
      setState({ kind: 'error', message: 'Solo se permiten archivos PDF, PNG, JPG o WEBP.' })
      return
    }
    if (candidate.size > MAX_BYTES) {
      setState({ kind: 'error', message: 'El archivo supera el tamaño máximo (8 MB).' })
      return
    }
    setState({ kind: 'idle' })
    setFile(candidate)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSet(dropped)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) validateAndSet(selected)
  }

  async function handleUpload() {
    if (!file) return
    setState({ kind: 'uploading' })

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/chat-docs/cedula-fiscal', {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState({
          kind: 'error',
          message: json?.error ?? 'No se pudo procesar la cédula fiscal.',
        })
        return
      }
      setState({
        kind: 'success',
        rfc: json.rfc ?? '',
        titulo: json.titulo ?? '',
        data: (json.data ?? {}) as CedulaData,
        updated: Boolean(json.updated),
      })
    } catch {
      setState({ kind: 'error', message: 'Error de conexión. Intenta de nuevo.' })
    }
  }

  function handleFinish() {
    if (state.kind === 'success') {
      onSuccess(state.rfc, state.titulo)
    }
    onClose()
  }

  const isUploading = state.kind === 'uploading'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isUploading ? undefined : onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Subir cédula fiscal</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              El archivo NO se guarda. Solo se envía a OpenAI para extraer los datos y guardarlos en la base documental.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition disabled:opacity-40"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {state.kind !== 'success' && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!isUploading) setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={isUploading ? undefined : handleDrop}
                onClick={() => !isUploading && inputRef.current?.click()}
                className={[
                  'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer select-none transition-colors px-6 py-10',
                  dragging
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                    : file
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800/50 hover:border-slate-400 dark:hover:border-zinc-500',
                  isUploading ? 'opacity-60 pointer-events-none' : '',
                ].join(' ')}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={handleChange}
                />
                {file ? (
                  <>
                    <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 break-all text-center px-2">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFile(null)
                        setState({ kind: 'idle' })
                      }}
                      className="mt-1 text-xs font-medium text-slate-500 hover:text-red-600 transition"
                    >
                      Quitar archivo
                    </button>
                  </>
                ) : (
                  <>
                    <svg className="h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm text-slate-600 dark:text-zinc-300 text-center">
                      Arrastra la cédula fiscal aquí
                      <br />
                      <span className="text-xs text-slate-500 dark:text-zinc-500">
                        o haz clic para seleccionar (PDF, PNG, JPG, WEBP - máx 8 MB)
                      </span>
                    </span>
                  </>
                )}
              </div>

              {state.kind === 'error' && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {state.message}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isUploading}
                  className="rounded-lg border border-slate-200 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || isUploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Procesando...
                    </>
                  ) : (
                    'Extraer y guardar'
                  )}
                </button>
              </div>
            </>
          )}

          {state.kind === 'success' && (
            <>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-sm font-semibold">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {state.updated ? 'Cédula actualizada' : 'Cédula registrada'} para este RFC
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                {state.rfc && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">RFC:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100 font-mono">{state.rfc}</dd>
                  </div>
                )}
                {(state.data.razon_social || state.data.nombre) && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">Nombre:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100">{state.data.razon_social || state.data.nombre}</dd>
                  </div>
                )}
                {state.data.tipo_persona && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">Tipo persona:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100 capitalize">{state.data.tipo_persona}</dd>
                  </div>
                )}
                {state.data.situacion_contribuyente && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">Situación:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100">{state.data.situacion_contribuyente}</dd>
                  </div>
                )}
                {state.data.regimenes && state.data.regimenes.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">Regímenes:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100">
                      {state.data.regimenes.map((r) => r.regimen).filter(Boolean).join(', ')}
                    </dd>
                  </div>
                )}
                {state.data.domicilio?.codigo_postal && (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-semibold text-slate-600 dark:text-zinc-400">CP:</dt>
                    <dd className="text-slate-900 dark:text-zinc-100 font-mono">{state.data.domicilio.codigo_postal}</dd>
                  </div>
                )}
              </dl>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
