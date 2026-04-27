'use client'

import { useState } from 'react'
import DropZone from './DropZone'
import { uploadFiles } from '../api/actions/upload'

export default function Dashboard() {
  const [rfc, setRfc] = useState('')
  const [efiel, setEfiel] = useState('')
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('rfc', rfc)
    formData.append('efiel', efiel)
    if (cerFile) formData.append('cer', cerFile)
    if (keyFile) formData.append('key', keyFile)

    const result = await uploadFiles(formData)
    setStatus(result)
    setLoading(false)

    if (result.success) {
      setRfc('')
      setEfiel('')
      setCerFile(null)
      setKeyFile(null)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center">
      {/* Fixed-width desktop card */}
      <div className="w-[900px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col">

        {/* Header bar */}
        <div className="bg-blue-600 px-8 py-5">
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard de Certificados</h1>
          <p className="text-sm text-blue-100 mt-0.5">Ingresa los datos y sube los archivos de firma electronica.</p>
        </div>

        {/* Body: two columns */}
        <form onSubmit={handleSubmit} className="flex flex-row gap-0">

          {/* Left column — inputs + actions */}
          <div className="flex flex-col gap-5 px-8 py-7 w-[340px] border-r border-zinc-200 dark:border-zinc-700 shrink-0">

            <div className="flex flex-col gap-1">
              <label htmlFor="rfc" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                RFC
              </label>
              <input
                id="rfc"
                type="text"
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="Ej. XAXX010101000"
                maxLength={50}
                required
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="efiel" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                EFIEL
              </label>
              <input
                id="efiel"
                type="text"
                value={efiel}
                onChange={(e) => setEfiel(e.target.value)}
                placeholder="Contrasena de la e.firma"
                required
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
              />
            </div>

            {/* Structure preview */}
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 mt-auto">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Estructura en Vercel Blob</p>
              <pre className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono whitespace-pre">
{`blob/
  ${rfc || '<RFC>'}/
    |- archivo.CER
    |- archivo.KEY
    |- efiel.txt`}
              </pre>
            </div>

            {status && (
              <div
                className={[
                  'rounded-lg px-4 py-3 text-sm font-medium',
                  status.success
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
                ].join(' ')}
              >
                {status.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors text-sm"
            >
              {loading ? 'Guardando...' : 'Guardar archivos'}
            </button>
          </div>

          {/* Right column — drop zones stacked */}
          <div className="flex flex-col gap-6 px-8 py-7 flex-1">
            <DropZone
              label="Certificado (.CER)"
              accept=".cer"
              extension="cer"
              file={cerFile}
              onFile={setCerFile}
            />
            <DropZone
              label="Llave privada (.KEY)"
              accept=".key"
              extension="key"
              file={keyFile}
              onFile={setKeyFile}
            />
          </div>

        </form>
      </div>
    </div>
  )
}
