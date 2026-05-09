import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPostLoginRedirect } from "@/lib/redirect";
import Dashboard from "../components/Dashboard";

export default async function UploadFielPage() {
  const session = await getSession();
  if (!session) redirect("/upload-f");

  // Los miembros no configuran EFIEL, van directo al dashboard
  if (session.role === 'member') redirect("/dashboard");

  const destination = await getPostLoginRedirect(session.sub);
  if (destination === "/dashboard") redirect("/dashboard");

  return <Dashboard />;
}