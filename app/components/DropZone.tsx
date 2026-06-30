'use client'

import { useRef, useState, DragEvent, ChangeEvent } from 'react'

interface DropZoneProps {
  label: string
  accept: string
  extension: string
  file: File | null
  onFile: (file: File | null) => void
}

export default function DropZone({ label, accept, extension, file, onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function validateAndSet(candidate: File) {
    const ext = candidate.name.split('.').pop()?.toLowerCase()
    if (ext !== extension.toLowerCase()) {
      setError(`Solo se permiten archivos .${extension.toUpperCase()}`)
      onFile(null)
      return
    }
    setError('')
    onFile(candidate)
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

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
        {label}
      </span>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer select-none transition-colors px-8 py-12',
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : file
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-500',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
        {file ? (
          <>
            <span className="text-2xl">&#10003;</span>
            <span className="text-sm font-medium text-green-700 dark:text-green-400 break-all text-center">
              {file.name}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFile(null); setError('') }}
              className="text-xs text-zinc-500 hover:text-red-500 mt-1"
            >
              Quitar
            </button>
          </>
        ) : (
          <>
            <span className="text-3xl text-zinc-400 dark:text-zinc-500">&#8681;</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Arrastra un archivo <span className="font-semibold">.{extension.toUpperCase()}</span> aquí
              <br />
              o haz clic para seleccionar
            </span>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
