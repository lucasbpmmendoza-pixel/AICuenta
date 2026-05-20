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

  let accountType: string | null = null;
  let rfcFromDb: string | null = null;
  let efieles: string[] = [];
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
  if (!accountType) redirect("/upload-fiel");

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-zinc-950">
      <Sidebar userName={session.name} accountType={accountType as "single" | "multi"} role={session.role} ownerId={session.ownerId} />
    <div className="flex-1 flex flex-col lg:ml-60">
          <ConfiguracionView
          session={session}
          accountType={accountType as "single" | "multi"}
          rfcFromDb={rfcFromDb}
          efieles={efieles}
        />
        <DashboardFooter />
      </div>
    </div>
  );
}
