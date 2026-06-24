import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import Sidebar from '@/app/components/Sidebar'
import ComprobantesView from '@/app/components/ComprobantesView'
import DashboardFooter from '@/app/components/DashboardFooter'

export default async function ComprobantesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const effectiveId = session.ownerId ?? session.sub

  // En modo demo el id de sesión no es un GUID (p. ej. "demo-user"), así que no
  // se consulta la base (provocaría un error de conversión a uniqueidentifier).
  let accountType: string | null = session.isDemo ? 'multi' : null
  if (!session.isDemo) {
    try {
      const db = await getDb()
      const result = await db
        .request()
        .input('id', effectiveId)
        .query<{ account_type: string | null }>('SELECT account_type FROM users WHERE id = @id')
      accountType = result.recordset[0]?.account_type ?? null
    } catch (err) {
      console.error('[comprobantes] Error al leer account_type:', (err as Error).message)
    }
  }
  if (!accountType) redirect('/upload-fiel')

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar
        userName={session.name}
        accountType={accountType as 'single' | 'multi'}
        role={session.role}
        ownerId={session.ownerId}
      />
      <div className="flex-1 flex flex-col lg:ml-60">
        <ComprobantesView />
        <DashboardFooter />
      </div>
    </div>
  )
}
