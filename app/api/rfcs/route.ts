import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { rfcAlias } from "@/lib/rfc-aliases";
import { getDemoRfcs } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
import { loadOwnerCfdiQuota } from "@/lib/cfdi-quota";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (isDemoSession(session)) {
    return NextResponse.json({ rfcs: getDemoRfcs(), quota: null });
  }

  const effectiveUserId = session.ownerId ?? session.sub;

  try {
    const db = await getDb();

    // Cuota de CFDIs del dueno (tope del plan vs total usado). La UI la usa para
    // avisar "excediste tu plan, elimina un RFC" cuando overQuota === true.
    const quota = await loadOwnerCfdiQuota(db, effectiveUserId);

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

    // Nombre del cliente desde tb_clientes (catalogo maestro), usado como
    // fallback del alias de EFIELES para mostrar en el selector.
    const CLIENTE_NAME_JOIN = `
      OUTER APPLY (
        SELECT TOP 1 tc.name
        FROM tb_clientes tc WITH (NOLOCK)
        WHERE tc.rfc = e.rfc
      ) cli
    `;

    // Cuantos miembros del equipo hay y cuantos tienen acceso a cada RFC, para
    // el boton "Compartir con equipo" de la vista de RFCs (solo owner).
    const TEAM_SHARE_APPLY = `
      OUTER APPLY (
        SELECT COUNT(*) AS team_total,
               SUM(CASE WHEN mr.efiel_id IS NOT NULL THEN 1 ELSE 0 END) AS team_shared
        FROM users u WITH (NOLOCK)
        LEFT JOIN member_rfcs mr WITH (NOLOCK) ON mr.member_id = u.id AND mr.efiel_id = e.id
        WHERE u.owner_id = e.user_id AND u.role = 'member'
      ) team
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
          cliente_nombre: string | null;
        }>(
          `SELECT e.id, e.rfc, e.alias, e.fiel, e.downloads_enabled, e.created_at, e.last_update,
                  ISNULL(c.cfdis_5a, 0) AS cfdis_5a,
                  cli.name AS cliente_nombre
           FROM EFIELES e
           INNER JOIN member_rfcs mr ON mr.efiel_id = e.id AND mr.member_id = @memberId
           ${CFDIS_5A_JOIN}
           ${CLIENTE_NAME_JOIN}
           ORDER BY e.created_at DESC`
        );
      return NextResponse.json({
        rfcs: result.recordset.map(({ cliente_nombre, ...r }) => ({
          ...r,
          alias: rfcAlias(r.rfc) ?? r.alias ?? cliente_nombre,
        })),
        quota,
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
        cliente_nombre: string | null;
        team_total: number;
        team_shared: number;
      }>(
        `SELECT e.id, e.rfc, e.alias, e.fiel, e.downloads_enabled, e.created_at, e.last_update,
                ISNULL(c.cfdis_5a, 0) AS cfdis_5a,
                cli.name AS cliente_nombre,
                team.team_total, ISNULL(team.team_shared, 0) AS team_shared
         FROM EFIELES e
         ${CFDIS_5A_JOIN}
         ${CLIENTE_NAME_JOIN}
         ${TEAM_SHARE_APPLY}
         WHERE e.user_id = @user_id
         ORDER BY e.created_at DESC`
      );
    return NextResponse.json({
      rfcs: result.recordset.map(({ cliente_nombre, ...r }) => ({
        ...r,
        alias: rfcAlias(r.rfc) ?? r.alias ?? cliente_nombre,
      })),
      quota,
    });
  } catch (err) {
    console.error("[rfcs GET] DB error:", (err as Error).message);
    return NextResponse.json({ error: "Error al obtener los RFCs" }, { status: 503 });
  }
}
