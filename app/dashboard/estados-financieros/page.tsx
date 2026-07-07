import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { userHasEfiel } from "@/lib/redirect";
import EstadosFinancierosView from "@/app/components/EstadosFinancierosView";

export default async function EstadosFinancierosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const effectiveId = session.ownerId ?? session.sub;

  // Usuario con cuenta pero SIN e.firma: sus Estados Financieros se arman con los
  // XML que sube en "Crea tus cuadros" (modo XML), en vez de leer de la BD.
  if (!session.isDemo && session.role !== "member" && !(await userHasEfiel(effectiveId))) {
    return <EstadosFinancierosView session={session} accountType="multi" xmlMode />;
  }

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
      console.error("[estados-financieros] Error al leer account_type:", (err as Error).message);
    }
  }
  if (!accountType) redirect("/upload-fiel");

  return <EstadosFinancierosView session={session} accountType={accountType as "single" | "multi"} />;
}
