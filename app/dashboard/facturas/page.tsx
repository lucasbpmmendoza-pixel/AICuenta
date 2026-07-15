import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { userHasEfiel } from "@/lib/redirect";
import { isDemoEmail } from "@/lib/demo-mode";
import FacturasView from "@/app/components/FacturasView";
import DemoCuadrosView from "@/app/components/DemoCuadrosView";

export default async function FacturasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Cuenta demo dedicada (p. ej. marketing): ve las facturas demo ya cargadas,
  // con sus cuadros descargables — NO la herramienta de subir XMLs.
  if (session.isDemo && isDemoEmail(session.email)) {
    return <FacturasView session={session} accountType="multi" />;
  }

  // En modo demo, Facturas se convierte en la herramienta "Crea tus cuadros gratis":
  // el visitante sube sus propios XMLs y se procesan localmente (sin tocar la BD).
  if (session.isDemo) {
    return <DemoCuadrosView session={session} accountType="multi" />;
  }

  const effectiveId = session.ownerId ?? session.sub;

  // Usuario con cuenta pero SIN e.firma: como todavía no tiene CFDIs del SAT,
  // Facturas es la misma herramienta "Crea tus cuadros" para que suba sus XML,
  // que alimentan su Dashboard y Estados Financieros reales (sin blur).
  if (session.role !== "member" && !(await userHasEfiel(effectiveId))) {
    return <DemoCuadrosView session={session} accountType="multi" />;
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
      console.error("[facturas] Error al leer account_type:", (err as Error).message);
    }
  }
  if (!accountType) redirect("/upload-fiel");

  return <FacturasView session={session} accountType={accountType as "single" | "multi"} />;
}
