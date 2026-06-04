import { NextResponse } from "next/server";
import { getChatDocsExport } from "@/lib/chat-docs-export-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "token requerido" }, { status: 400 });
  }

  const exported = getChatDocsExport(token);
  if (!exported) {
    return NextResponse.json(
      { error: "Archivo no disponible o expirado. Solicita generar el Excel nuevamente." },
      { status: 404 },
    );
  }

  return new NextResponse(Uint8Array.from(exported.buffer), {
    headers: {
      "Content-Type": exported.contentType,
      "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
