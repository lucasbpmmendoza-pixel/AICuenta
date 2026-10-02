import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalKey, loadContadoresSession, listAccessibleRfcs } from "@/lib/internal-cuadros";
import { rfcAlias } from "@/lib/rfc-aliases";

export async function GET(req: NextRequest) {
  if (!hasValidInternalKey(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const session = await loadContadoresSession();
    if (!session) return NextResponse.json({ error: "Cuenta de contadores no configurada o inactiva" }, { status: 503 });

    const rows = await listAccessibleRfcs(session);
    return NextResponse.json({
      account: session.email,
      rfcs: rows.map((r) => ({
        rfc: r.rfc,
        nombre: rfcAlias(r.rfc) ?? r.alias ?? r.nombre ?? null,
      })),
    });
  } catch (err) {
    console.error("[internal/cuadros/rfcs]", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener los RFCs" }, { status: 503 });
  }
}
