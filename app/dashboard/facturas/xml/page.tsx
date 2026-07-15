import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DemoCuadrosView from "@/app/components/DemoCuadrosView";

// Herramienta "Sube tus XMLs para la descarga", accesible para cualquier
// usuario autenticado desde el selector de empresa en Facturas. Procesa los
// XMLs localmente (sin tocar la BD), igual que la herramienta "Crea tus cuadros".
export default async function FacturasXmlPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DemoCuadrosView session={session} accountType="multi" />;
}
