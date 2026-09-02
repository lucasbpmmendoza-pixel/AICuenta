import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { validateRfcAccess } from "@/lib/rfc-access";
import { fetchPagosData } from "@/lib/facturas-query";
import { buildDemoPagos } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
import { isFreemiumOwner, currentMonthPeriod } from "@/lib/freemium";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const demoMode = isDemoSession(session);

  const { searchParams } = new URL(req.url);
  const rfc       = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year      = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP    = searchParams.get("month");
  const quarterP  = searchParams.get("quarter");
  const dateFromP = searchParams.get("dateFrom");
  const dateToP   = searchParams.get("dateTo");

  if (!rfc) return NextResponse.json({ error: "rfc requerido" }, { status: 400 });

  let dateFrom: Date;
  let dateTo: Date;

  // Freemium: ignora el periodo pedido y fuerza el mes actual.
  const freemium = !demoMode && (await isFreemiumOwner(session));

  if (freemium) {
    const cm = currentMonthPeriod();
    dateFrom = new Date(Date.UTC(cm.year, cm.month - 1, 1));
    dateTo   = new Date(Date.UTC(cm.year, cm.month, 1));
  } else if (dateFromP && dateToP) {
    const df = new Date(dateFromP);
    const dt = new Date(dateToP);
    if (isNaN(df.getTime()) || isNaN(dt.getTime()))
      return NextResponse.json({ error: "fechas inválidas" }, { status: 400 });
    dateFrom = df;
    dateTo   = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
  } else {
    if (isNaN(year)) return NextResponse.json({ error: "year inválido" }, { status: 400 });
    if (quarterP !== null) {
      const q = parseInt(quarterP, 10);
      if (isNaN(q) || q < 1 || q > 4) return NextResponse.json({ error: "quarter inválido" }, { status: 400 });
      dateFrom = new Date(Date.UTC(year, (q - 1) * 3, 1));
      dateTo   = new Date(Date.UTC(year, q * 3, 1));
    } else if (monthP !== null) {
      const month = parseInt(monthP, 10);
      if (isNaN(month) || month < 1 || month > 12) return NextResponse.json({ error: "month inválido" }, { status: 400 });
      dateFrom = new Date(Date.UTC(year, month - 1, 1));
      dateTo   = new Date(Date.UTC(year, month, 1));
    } else {
      dateFrom = new Date(Date.UTC(year, 0, 1));
      dateTo   = new Date(Date.UTC(year + 1, 0, 1));
    }
  }

  try {
    if (demoMode) {
      return NextResponse.json({ pagos: buildDemoPagos(rfc, dateFrom, dateTo) });
    }

    if (!(await validateRfcAccess(session, rfc))) {
      return NextResponse.json({ error: "RFC no encontrado" }, { status: 403 });
    }

    const pagos = await fetchPagosData(rfc, dateFrom, dateTo, 10);
    return NextResponse.json({ pagos });
  } catch (err) {
    console.error("[pagos/data]", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener pagos" }, { status: 503 });
  }
}
