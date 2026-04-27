import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardView from "../components/DashboardView";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DashboardView session={session} />;
}

