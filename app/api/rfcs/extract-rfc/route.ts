import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { extractRfcFromCer } from "@/lib/cer-rfc";

// mssql/crypto requieren el runtime de Node (no Edge)
export const runtime = "nodejs";

// POST /api/rfcs/extract-rfc  (multipart, campo "cer")
// Lee el RFC del certificado .cer para autocompletar el formulario de alta.
// No guarda nada; solo parsea el certificado en memoria.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const cer = form.get("cer");
  if (!(cer instanceof File) || cer.size === 0) {
    return NextResponse.json({ error: "Falta el archivo .cer" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await cer.arrayBuffer());
    const rfc = extractRfcFromCer(buf);
    return NextResponse.json({ rfc });
  } catch (err) {
    console.error("[rfcs/extract-rfc]", (err as Error).message);
    return NextResponse.json({ rfc: null });
  }
}
