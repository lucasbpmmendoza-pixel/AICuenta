import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isDemoSession } from "@/lib/demo-mode";

export default async function Home() {
  const session = await getSession();
  const isDemo = isDemoSession(session);
  
  // Demo users / visitantes -> herramienta "Crea tus cuadros gratis" (landing)
  // Registered users -> docs assistant
  if (session && !isDemo) {
    redirect("/dashboard/chat-docs");
  }

  redirect("/dashboard/facturas?demo=1");
}

