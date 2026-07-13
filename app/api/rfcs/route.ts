import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { rfcAlias } from "@/lib/rfc-aliases";
import { getDemoRfcs } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ rfcs: getDemoRfcs() });
  }

  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();

    // Subquery reutilizable: suma de CFDIs (recibidos+emitidos) de los ultimos 5 anios por RFC.
    // Se apoya en dbo.conteo_cfdi, poblada mes a mes por el job contarSAT_bd.php.
    const CFDIS_5A_JOIN = `
      LEFT JOIN (
        SELECT rfc, SUM(total) AS cfdis_5a
        FROM dbo.conteo_cfdi
        WHERE (anio * 100 + mes) >= (YEAR(DATEADD(YEAR, -4, GETDATE())) * 100 + MONTH(GETDATE()))
        GROUP BY rfc
      ) c ON c.rfc = e.rfc
    `;

    // Miembros solo ven los RFCs que el owner les asignó explícitamente en member_rfcs
    if (session.role === "member") {
      const result = await db
        .request()
        .input("memberId", session.sub)
        .query<{
          id: string;
          rfc: string;
          alias: string | null;
          fiel: string;
          downloads_enabled: boolean;
          created_at: string;
          last_update: string;
          cfdis_5a: number;
        }>(
          `SELECT e.id, e.rfc, e.alias, e.fiel, e.downloads_enabled, e.created_at, e.last_update,
                  ISNULL(c.cfdis_5a, 0) AS cfdis_5a
           FROM EFIELES e
           INNER JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
           ${CFDIS_5A_JOIN}
           ORDER BY e.created_at DESC`
        );
      return NextResponse.json({
        rfcs: result.recordset.map(r => ({
          ...r,
          alias: rfcAlias(r.rfc) ?? r.alias,
        })),
      });
    }

    const result = await db
      .request()
      .input("user_id", effectiveUserId)
      .query<{
        id: string;
        rfc: string;
        alias: string | null;
        fiel: string;
        downloads_enabled: boolean;
        created_at: string;
        last_update: string;
        cfdis_5a: number;
      }>(
        `SELECT e.id, e.rfc, e.alias, e.fiel, e.downloads_enabled, e.created_at, e.last_update,
                ISNULL(c.cfdis_5a, 0) AS cfdis_5a
         FROM EFIELES e
         ${CFDIS_5A_JOIN}
         WHERE e.user_id = @user_id
         ORDER BY e.created_at DESC`
      );
    return NextResponse.json({
      rfcs: result.recordset.map(r => ({
        ...r,
        alias: rfcAlias(r.rfc) ?? r.alias,
      })),
    });
  } catch (err) {
    console.error("[rfcs GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener los RFCs" }, { status: 503 });
  }
}
