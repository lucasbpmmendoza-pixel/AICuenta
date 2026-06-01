import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import PublicChatDocsLanding from "./components/PublicChatDocsLanding";

export const metadata: Metadata = {
  title: "AIcuenta | Asistente Docs",
  description:
    "Consulta tu Asistente Docs desde el primer acceso. Si no tienes sesion iniciada, podras usar el modo publico con limite de consultas.",
};

export default async function Home() {
  const session = await getSession();
  const publicDailyLimit = Math.min(
    100,
    Math.max(1, parseInt(process.env.PUBLIC_CHAT_DOCS_DAILY_LIMIT ?? "8", 10) || 8),
  );

  if (session) {
    redirect("/dashboard/chat-docs");
  }

  return <PublicChatDocsLanding dailyLimit={publicDailyLimit} />;
}

