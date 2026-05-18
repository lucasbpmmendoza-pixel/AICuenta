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
  let allRfcs: string[] = [];
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

    if (session.role === "member") {
      // Miembros solo ven los RFCs que el owner les asignó
      const memberRfcResult = await db
        .request()
        .input("memberId", session.sub)
        .query<{ rfc: string }>(
          `SELECT e.rfc FROM EFIELES e
           INNER JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
           ORDER BY e.created_at DESC`
        );
      allRfcs = memberRfcResult.recordset.map((r) => r.rfc);
      rfcFromDb = allRfcs[0] ?? null;
    } else {
      const rfcResult = await db
        .request()
        .input("user_id", effectiveId)
        .query<{ rfc: string }>(
          "SELECT rfc FROM EFIELES WHERE user_id = @user_id ORDER BY created_at DESC"
        );
      rfcFromDb = rfcResult.recordset[0]?.rfc ?? null;
      const efielesRfcs = rfcResult.recordset.map((r) => r.rfc);
      allRfcs = [...new Set([ownerRfc, ...efielesRfcs].filter(Boolean))] as string[];
    }
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
      allRfcs={allRfcs}
    />
  );
}
