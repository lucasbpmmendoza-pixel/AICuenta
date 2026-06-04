import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import Sidebar from "@/app/components/Sidebar";
import RFCsView from "@/app/components/RFCsView";
import DashboardFooter from "@/app/components/DashboardFooter";

export default async function RFCsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const effectiveId = session.ownerId ?? session.sub;

  let accountType: string | null = session.isDemo ? "multi" : null;
  if (!session.isDemo) {
    try {
      const db = await getDb();
      const result = await db
        .request()
        .input("id", effectiveId)
        .query<{ account_type: string | null }>("SELECT account_type FROM users WHERE id = @id");
      accountType = result.recordset[0]?.account_type ?? null;
    } catch (err) {
      console.error("[rfcs] Error al leer account_type:", (err as Error).message);
    }
  }
  if (!accountType) redirect("/upload-fiel");

  // Bloquear acceso para usuarios chikenelo y member
  if (!session.isDemo && (session.role === 'chikenelo' || session.role === 'member')) redirect("/dashboard");

  // Esta sección solo aplica para cuentas multi
  if (!session.isDemo && accountType !== "multi") redirect("/dashboard");

  const readOnly = !!session.isDemo;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType="multi" role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
      <div className="flex-1 flex flex-col lg:ml-60">
        {session.isDemo && (
          <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Vista demo: esta seccion es solo visual.
          </div>
        )}
        <RFCsView readOnly={readOnly} />
        <DashboardFooter />
      </div>
    </div>
  );
}
