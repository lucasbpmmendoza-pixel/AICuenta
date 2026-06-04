import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isDemoSession } from "@/lib/demo-mode";

export default async function Home() {
  const session = await getSession();
  const isDemo = isDemoSession(session);
  
  // Demo users -> chat demo
  // Registered users -> dashboard
  // No session -> landing/login fallback
  if (session && !isDemo) {
    redirect("/dashboard");
  }
  
  redirect("/dashboard/chat-docs?demo=1");
}

