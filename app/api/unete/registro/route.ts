import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { nombre } = await req.json();
  if (!nombre?.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  try {
    const db = await getDb();

    // Obtener RFC desde users (el que se muestra en la pantalla)
    const effectiveId = session.ownerId ?? session.sub;
    const rfcResult = await db
      .request()
      .input("id", effectiveId)
      .query<{ rfc: string | null }>(
        "SELECT rfc FROM users WHERE id = @id"
      );

    const rfc = rfcResult.recordset[0]?.rfc;
    if (!rfc) {
      return NextResponse.json({ error: "Sin RFC registrado en la cuenta" }, { status: 404 });
    }

    // Si ya existe el RFC, actualiza el nombre y devuelve el Id existente; si no, inserta
    const upsertResult = await db
      .request()
      .input("rfc", rfc)
      .input("nombre", nombre.trim())
      .query<{ Id: number }>(
        `IF EXISTS (SELECT 1 FROM Chikenelo_login WHERE RFC = @rfc)
         BEGIN
           UPDATE Chikenelo_login SET NombreCompleto = @nombre WHERE RFC = @rfc;
           SELECT Id FROM Chikenelo_login WHERE RFC = @rfc;
         END
         ELSE
         BEGIN
           INSERT INTO Chikenelo_login (WhatsAppConversationId, RFC, NombreCompleto)
           OUTPUT INSERTED.Id
           VALUES ('', @rfc, @nombre);
         END`
      );

    const id = upsertResult.recordset[0]?.Id;
    return NextResponse.json({ id, rfc });
  } catch (err) {
    console.error("[unete/registro]", (err as Error).message);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
