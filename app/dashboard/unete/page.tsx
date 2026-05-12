import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import DashboardUneteView from "@/app/components/DashboardUneteView";

export default async function DashboardUnetePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const effectiveId = session.ownerId ?? session.sub;

  let accountType: string | null = null;
  let rfcFromDb: string | null = null;
  let ownerRfc: string | null = null;
  try {
    const db = await getDb();
    const userResult = await db
      .request()
      .input("id", effectiveId)
      .query<{ account_type: string | null; rfc: string | null }>(
        "SELECT account_type, rfc FROM users WHERE id = @id"
      );
    accountType = userResult.recordset[0]?.account_type ?? null;
    ownerRfc = userResult.recordset[0]?.rfc ?? null;

    const rfcResult = await db
      .request()
      .input("user_id", effectiveId)
      .query<{ rfc: string }>(
        "SELECT TOP 1 rfc FROM EFIELES WHERE user_id = @user_id ORDER BY created_at DESC"
      );
    rfcFromDb = rfcResult.recordset[0]?.rfc ?? null;
  } catch (err) {
    console.error("[dashboard/unete] Error al leer datos:", (err as Error).message);
  }
  if (!accountType) redirect("/upload-fiel");

  return (
    <DashboardUneteView
      session={session}
      accountType={accountType as "single" | "multi"}
      rfcFromDb={rfcFromDb ?? ""}
      ownerRfc={ownerRfc}
    />
  );
}
