import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isDemoSession } from "@/lib/demo-mode";
import LoginView from "../components/LoginView";

export default async function LoginPage() {
  const session = await getSession();
  const isDemo = isDemoSession(session);
  
  // Registered users should not access login page
  if (session && !isDemo) {
    redirect("/dashboard/chat-docs");
  }
  
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}

