import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isDemoSession } from "@/lib/demo-mode";
import RegisterView from "../components/RegisterView";

export default async function RegisterPage() {
  const session = await getSession();
  const isDemo = isDemoSession(session);
  
  // Registered users should not access register page
  if (session && !isDemo) {
    redirect("/dashboard");
  }
  
  return <RegisterView />;
}

