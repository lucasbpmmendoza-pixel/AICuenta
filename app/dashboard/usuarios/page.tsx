import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import Sidebar from "@/app/components/Sidebar";
import UsuariosView from "@/app/components/UsuariosView";
import DashboardFooter from "@/app/components/DashboardFooter";

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Solo los owners pueden gestionar usuarios
  // Tolerante con JWTs emitidos antes de agregar el campo role
  if (session.role && session.role !== "owner") redirect("/dashboard");

  const effectiveId = session.ownerId ?? session.sub;

  let accountType: string | null = null;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("id", effectiveId)
      .query<{ account_type: string | null }>("SELECT account_type FROM users WHERE id = @id");
    accountType = result.recordset[0]?.account_type ?? null;
  } catch (err) {
    console.error("[usuarios] Error al leer account_type:", (err as Error).message);
  }
  if (!accountType) redirect("/upload-fiel");

  // Esta sección solo aplica para cuentas multi
  if (accountType !== "multi") redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType="multi" />
      <div className="flex-1 flex flex-col">
        <UsuariosView />
        <DashboardFooter />
      </div>
    </div>
  );
}
