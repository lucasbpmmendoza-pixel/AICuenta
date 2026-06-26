import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { isFreemiumOwner, FREEMIUM_FORBIDDEN_MESSAGE } from "@/lib/freemium";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (await isFreemiumOwner(session)) {
    return NextResponse.json({ error: FREEMIUM_FORBIDDEN_MESSAGE }, { status: 403 });
  }

  const { nombre, selectedRfc, rfcs: clientRfcs } = await req.json();
  if (!nombre?.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  try {
    const db = await getDb();

    const effectiveId = session.ownerId ?? session.sub;

    // Obtener todos los RFCs del usuario (owner RFC + RFCs en EFIELES)
    const [ownerResult, efielesResult] = await Promise.all([
      db.request().input("id", effectiveId)
        .query<{ rfc: string | null }>("SELECT rfc FROM users WHERE id = @id"),
      db.request().input("user_id", effectiveId)
        .query<{ rfc: string }>("SELECT rfc FROM EFIELES WHERE user_id = @user_id"),
    ]);

    const ownerRfc = ownerResult.recordset[0]?.rfc;
    const efielesRfcs = efielesResult.recordset.map((r) => r.rfc);
    const allRfcs = [...new Set([ownerRfc, ...efielesRfcs].filter(Boolean))] as string[];

    if (allRfcs.length === 0) {
      return NextResponse.json({ error: "Sin RFC registrado en la cuenta" }, { status: 404 });
    }

    // Filtrar a los RFCs que el cliente envió, validando que pertenecen al usuario
    const clientSet = Array.isArray(clientRfcs) ? (clientRfcs as string[]).filter(r => allRfcs.includes(r)) : allRfcs;
    const rfcsToRegister = clientSet.length > 0 ? clientSet : allRfcs;

    // Validar que el RFC seleccionado pertenece al usuario
    const mainRfc = (selectedRfc && rfcsToRegister.includes(selectedRfc)) ? selectedRfc : rfcsToRegister[0];

    // Reusar UserCode existente de cualquier fila del usuario, o generar uno nuevo
    const existingResult = await db
      .request()
      .input("rfcs", mainRfc)
      .query<{ UserCode: number | null }>(
        "SELECT TOP 1 UserCode FROM Chikenelo_login WHERE RFC = @rfcs AND UserCode IS NOT NULL"
      );
    const userCode = existingResult.recordset[0]?.UserCode
      ?? Math.floor(100000 + Math.random() * 900000);

    const fechaLogin = new Date();

    // Upsert una fila por cada RFC a registrar con el mismo UserCode
    for (const rfc of rfcsToRegister) {
      const code = Math.floor(100000 + Math.random() * 900000);
      await db
        .request()
        .input("rfc", rfc)
        .input("nombre", nombre.trim())
        .input("fechaLogin", fechaLogin)
        .input("code", code)
        .input("userCode", userCode)
        .query(
          `IF EXISTS (SELECT 1 FROM Chikenelo_login WHERE RFC = @rfc)
           BEGIN
             UPDATE Chikenelo_login
               SET NombreCompleto = @nombre, FechaLogin = @fechaLogin,
                   Code = @code, UserCode = @userCode
             WHERE RFC = @rfc;
           END
           ELSE
           BEGIN
             INSERT INTO Chikenelo_login (WhatsAppConversationId, RFC, NombreCompleto, FechaLogin, Code, UserCode)
             VALUES ('', @rfc, @nombre, @fechaLogin, @code, @userCode);
           END`
        );
    }

    // Devolver el Code del RFC seleccionado para el mensaje de WhatsApp
    const mainRow = await db
      .request()
      .input("rfc", mainRfc)
      .query<{ Id: number; Code: number }>(
        "SELECT Id, Code FROM Chikenelo_login WHERE RFC = @rfc"
      );

    return NextResponse.json({
      id: mainRow.recordset[0]?.Id,
      userCode,
      code: mainRow.recordset[0]?.Code,
      rfc: mainRfc,
      rfcsRegistrados: allRfcs.length,
    });
  } catch (err) {
    console.error("[unete/registro]", (err as Error).message);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
