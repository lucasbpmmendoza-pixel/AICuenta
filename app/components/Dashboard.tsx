'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DropZone from './DropZone'
import { uploadFiles } from '../api/actions/upload'

export default function Dashboard() {
  const router = useRouter()
  const [rfc, setRfc] = useState('')
  const [efiel, setEfiel] = useState('')
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState('')

  function handleUnete() {
    const mensaje = encodeURIComponent(`${nombre.trim()} ${rfc.trim()}`)
    window.open(`https://wa.me/526563138465?text=${mensaje}`, '_blank')
  }

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

  const uploadForm = (
    <form onSubmit={handleSubmit} className="flex flex-row gap-0">
      {/* Left column */}
      <div className="flex flex-col gap-5 px-8 py-7 w-[340px] border-r border-zinc-200 dark:border-zinc-700 shrink-0">
        <div className="flex flex-col gap-1">
          <label htmlFor="rfc" className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#450c7d' }}>
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
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-deep transition text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="efiel" className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#450c7d' }}>
            EFIEL
          </label>
          <input
            id="efiel"
            type="text"
            value={efiel}
            onChange={(e) => setEfiel(e.target.value)}
            placeholder="Contraseña de la e.firma"
            required
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-deep transition text-sm"
          />
        </div>


        {status && (
          <div
            className={[
              'rounded-lg px-4 py-3 text-sm font-medium mt-auto',
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
          className={`rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors text-sm${!status ? ' mt-auto' : ''}`}
          style={{ backgroundColor: '#450c7d' }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#7B6FE8' }}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#450c7d'}
        >
          {loading ? 'Guardando...' : 'Guardar archivos'}
        </button>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-6 px-8 py-7 flex-1" >
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
  )

  const unetePanel = (
    <div className="w-[300px] shrink-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      <div className="bg-gradient-to-b from-brand-green to-brand-lime px-6 py-5">
        <h2 className="text-lg font-bold text-white tracking-tight">Unete a nuestro equipo</h2>
        <p className="text-sm text-white/70 mt-0.5">Un paso mas para empezar.</p>
      </div>
      <div className="flex flex-col gap-5 px-6 py-6 flex-1">
        <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed">
          Para ser una empresa de vanguardia usamos IA. Si quieres unirte a nuestro equipo, escribenos por WhatsApp.
        </p>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#450c7d' }}>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ingresa tu nombre completo"
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
          />
        </div>
        {rfc && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            RFC: <span className="font-mono font-semibold text-zinc-600 dark:text-zinc-300">{rfc}</span>
          </p>
        )}
        <button
          type="button"
          onClick={handleUnete}
          disabled={nombre.trim() === '' || rfc.trim() === ''}
          className="mt-auto rounded-xl bg-brand-green hover:bg-[#25D366] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 transition-colors text-sm"
        >
          Aceptar - Ir a WhatsApp
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-start justify-center gap-6 py-10 px-4">
      {/* Main upload card */}
      <div className="w-[900px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-b from-brand-deep to-brand-purple px-8 py-5">
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard de Certificados</h1>
          <p className="text-sm text-white/70 mt-0.5">Accede al dashboard o registra tu FIEL cuando quieras.</p>
        </div>

        {/* Dashboard CTA */}
        <div className="px-8 py-8 flex flex-col items-center gap-3 border-b border-zinc-200 dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-md">
            Tu panel principal está listo. Puedes entrar al dashboard sin configurar tu FIEL.
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-1 inline-flex items-center gap-2 rounded-xl text-white font-semibold px-8 py-3 transition-colors text-sm"
            style={{ backgroundColor: '#450c7d' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#7B6FE8')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#450c7d')}
          >
            Ir al Dashboard
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Optional FIEL section */}
        <div className="px-8 py-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Opcional</span>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              También puedes registrar tu e.firma aquí.
            </p>
          </div>
          {uploadForm}
        </div>
      </div>

      {/* Unete panel */}
      {unetePanel}
    </div>
  )
}
