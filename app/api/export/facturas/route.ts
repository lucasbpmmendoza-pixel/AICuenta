import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { buildFacturasExport } from "@/lib/facturas-export";

export async function GET(req: NextRequest) {
  return buildFacturasExport(req, await getSession());
}
