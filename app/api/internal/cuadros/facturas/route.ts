import { NextRequest, NextResponse } from "next/server";
import { hasValidInternalKey, loadContadoresSession, hasTeamRfcAccess } from "@/lib/internal-cuadros";
import { buildFacturasExport } from "@/lib/facturas-export";

// RFCs con mucho volumen pueden tardar en armar el Excel.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!hasValidInternalKey(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let session;
  try {
    session = await loadContadoresSession();
  } catch (err) {
    console.error("[internal/cuadros/facturas]", (err as Error).message);
    return NextResponse.json({ error: "Error al cargar la cuenta de contadores" }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: "Cuenta de contadores no configurada o inactiva" }, { status: 503 });

  return buildFacturasExport(req, session, { rfcAccess: hasTeamRfcAccess });
}
