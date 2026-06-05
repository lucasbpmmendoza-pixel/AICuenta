import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isDemoSession } from "@/lib/demo-mode";

export default async function Home() {
  const session = await getSession();
  const isDemo = isDemoSession(session);
  
  // Demo users -> chat demo
  // Registered users -> docs assistant
  // No session -> landing/login fallback
  if (session && !isDemo) {
    redirect("/dashboard/chat-docs");
  }
  
  redirect("/dashboard/chat-docs?demo=1");
}

