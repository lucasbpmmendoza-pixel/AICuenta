import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import Sidebar from "@/app/components/Sidebar";
import ConfiguracionView from "@/app/components/ConfiguracionView";
import DashboardFooter from "@/app/components/DashboardFooter";

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const effectiveId = session.ownerId ?? session.sub;

  let accountType: string | null = session.isDemo ? "multi" : null;
  let rfcFromDb: string | null = session.isDemo ? "DEM010101AAA" : null;
  let efieles: string[] = session.isDemo ? ["DEM010101AAA", "DEM010101BBB"] : [];
  if (!session.isDemo) {
    try {
      const db = await getDb();
      const userResult = await db
        .request()
        .input("id", effectiveId)
        .query<{ account_type: string | null; rfc: string | null }>(
          "SELECT account_type, rfc FROM users WHERE id = @id"
        );
      accountType = userResult.recordset[0]?.account_type ?? null;
      // Miembros no ven su RFC personal en configuracion
      rfcFromDb = session.role === 'member' || session.ownerId
        ? null
        : (userResult.recordset[0]?.rfc ?? null);

      if (accountType === "multi" && session.role !== "member") {
        const efielesResult = await db
          .request()
          .input("user_id", effectiveId)
          .query<{ rfc: string }>(
            "SELECT rfc FROM EFIELES WHERE user_id = @user_id ORDER BY created_at DESC"
          );
        efieles = efielesResult.recordset.map((r) => r.rfc);
      }
    } catch (err) {
      console.error("[configuracion] Error al leer datos:", (err as Error).message);
    }
  }
  if (!accountType) redirect("/upload-fiel");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType as "single" | "multi"} role={session.role} ownerId={session.ownerId} isDemo={session.isDemo} />
    <div className="flex-1 flex flex-col lg:ml-60">
          {session.isDemo && (
            <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Vista demo: esta seccion es solo visual.
            </div>
          )}
          <div className={session.isDemo ? "pointer-events-none opacity-65" : ""}>
          <ConfiguracionView
          session={session}
          accountType={accountType as "single" | "multi"}
          rfcFromDb={rfcFromDb}
          efieles={efieles}
        />
        </div>
        <DashboardFooter />
      </div>
    </div>
  );
}
