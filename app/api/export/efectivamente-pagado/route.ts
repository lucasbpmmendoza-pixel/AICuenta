import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/session";
import { isFreemium, freemiumCanDownloadMonth } from "@/lib/membership";
import { getDb } from "@/lib/db";
import { fetchflujo, fetchNombreEmpresa } from "@/lib/facturas-query";
import { buildDemoFlujo, getDemoNombreEmpresa } from "@/lib/demo-data";
import { isDemoSession } from "@/lib/demo-mode";
import { consumeDemoDownloadSlot, formatRetryAfter } from "@/lib/demo-download-limit";
import { rfcDisplay, rfcAlias } from "@/lib/rfc-aliases";
import type { flujoRow } from "@/lib/facturas-query";

// ─── Style helpers ─────────────────────────────────────────────────────────────

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
}
function addBorder(cell: ExcelJS.Cell) {
  const b = { style: "thin" as const };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const HEADER_BG = "595959";
const DATE_FMT  = "dd/mm/yyyy";
const MXN_FMT   = '"$"#,##0.00';
const INGRESOS_BG = "1E7E34";
const EGRESOS_BG = "8A1C1C";
const TC_FMT    = "#,##0.0000";

const EP_HEADERS = [
  "Fuente", "UUID Complemento Pago", "UUID Documento Relacionado", "Fecha Emisión", "Fecha Pago",
  "RFC Emisor", "Razón Social Emisor",
  "RFC Receptor", "Razón Social Receptor",
  "Forma Pago", "Moneda", "Tipo Cambio",
  "Subtotal", "IVA", "Ret. ISR", "Ret. IVA", "Total",
];

const COL_WIDTHS = [15, 13, 13, 17, 30, 17, 30, 13, 10, 12, 14, 14, 13, 13, 14];
const COL_COUNT  = EP_HEADERS.length;

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function validateRfc(userId: string, rfc: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("uid", userId).input("rfc", rfc)
    .query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM EFIELES WITH (NOLOCK) WHERE user_id=@uid AND rfc=@rfc");
  return (r.recordset[0]?.cnt ?? 0) > 0;
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("No autorizado", { status: 401 });

  const { searchParams } = new URL(req.url);
  const rfc       = searchParams.get("rfc")?.trim().toUpperCase() ?? "";
  const year      = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const monthP    = searchParams.get("month");
  const quarterP  = searchParams.get("quarter");
  const dateFromP = searchParams.get("dateFrom");
  const dateToP   = searchParams.get("dateTo");

  if (!rfc) return new Response("rfc requerido", { status: 400 });

  if (await isFreemium(session)) {
    if (!freemiumCanDownloadMonth({ year, month: monthP, quarter: quarterP, dateFrom: dateFromP, dateTo: dateToP })) {
      return new Response("Plan gratis: solo puedes descargar el mes en curso. Suscribete para descargar otros periodos.", { status: 403 });
    }
  }

  let dateFrom: Date;
  let dateTo: Date;

  if (dateFromP && dateToP) {
    const df = new Date(dateFromP);
    const dt = new Date(dateToP);
    if (isNaN(df.getTime()) || isNaN(dt.getTime())) return new Response("fechas inválidas", { status: 400 });
    dateFrom = df;
    dateTo   = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
  } else {
    if (isNaN(year)) return new Response("Parámetros inválidos", { status: 400 });
    if (quarterP !== null) {
      const q = parseInt(quarterP, 10);
      if (isNaN(q) || q < 1 || q > 4) return new Response("quarter inválido", { status: 400 });
      dateFrom = new Date(Date.UTC(year, (q - 1) * 3, 1));
      dateTo   = new Date(Date.UTC(year, q * 3, 1));
    } else if (monthP !== null) {
      const month = parseInt(monthP, 10);
      if (isNaN(month) || month < 1 || month > 12) return new Response("month inválido", { status: 400 });
      dateFrom = new Date(Date.UTC(year, month - 1, 1));
      dateTo   = new Date(Date.UTC(year, month, 1));
    } else {
      dateFrom = new Date(Date.UTC(year, 0, 1));
      dateTo   = new Date(Date.UTC(year + 1, 0, 1));
    }
  }

  const demoMode = isDemoSession(session);
  if (!demoMode) {
    const effectiveUserId = session.ownerId ?? session.sub;
    if (!(await validateRfc(effectiveUserId, rfc))) {
      return new Response("RFC no encontrado", { status: 403 });
    }
  }

  let demoDownloadLimit: ReturnType<typeof consumeDemoDownloadSlot> | null = null;

  if (demoMode) {
    demoDownloadLimit = consumeDemoDownloadSlot(req);
    if (!demoDownloadLimit.allowed) {
      return new Response(
        `Limite demo alcanzado: 6 descargas cada 15 minutos. Intenta en ${formatRetryAfter(demoDownloadLimit.retryAfterSeconds)}.`,
        {
          status: 429,
          headers: {
            "Retry-After": String(demoDownloadLimit.retryAfterSeconds),
            "Set-Cookie": demoDownloadLimit.setCookie,
          },
        }
      );
    }
  }

  try {
    const [rows, nombreEmpresa] = demoMode
      ? [buildDemoFlujo(rfc, dateFrom, dateTo), getDemoNombreEmpresa(rfc)]
      : await Promise.all([
          fetchflujo(rfc, dateFrom, dateTo),
          fetchNombreEmpresa(rfc),
        ]);

    const computePagoIva = (subtotalMx: number, totalMx: number) => {
      const inferredIva = totalMx - subtotalMx;
      return inferredIva > 0 ? inferredIva : 0;
    };

    const normalizedRows = rows.map((row: flujoRow) => {
      const tc = Number(row.tipoCambio) || 1;
      const subtotalMx = Number(row.subtotal) * tc;
      const totalMx = Number(row.total) * tc;
      const rawIvaMx = Number(row.iva) * tc;
      const ivaMx = row.fuente === "Complemento P"
        ? computePagoIva(subtotalMx, totalMx)
        : rawIvaMx;

      return {
        ...row,
        movimiento: row.movimiento,
        tc,
        subtotalMx,
        ivaMx,
        retIsrMx: Number(row.retISR) * tc,
        retIvaMx: Number(row.retIVA) * tc,
        totalMx,
      };
    });

    const ingresos = normalizedRows.filter((r: typeof normalizedRows[number]) => r.movimiento === "INGRESO");
    const egresos = normalizedRows.filter((r: typeof normalizedRows[number]) => r.movimiento === "EGRESO");
    // ─── Build workbook ────────────────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("EFECTIVAMENTE PAGADO");

    COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Company header
    const hRow = ws.addRow([nombreEmpresa]);
    hRow.height = 20;
    const hCell = hRow.getCell(1);
    hCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    setFill(hCell, HEADER_BG);
    hCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    addBorder(hCell);
    ws.mergeCells(hRow.number, 1, hRow.number, COL_COUNT);

    // Blank row
    ws.addRow([]);

    const writeSection = (title: string, sectionRows: typeof normalizedRows) => {
      const sectionBg = title === "INGRESOS" ? INGRESOS_BG : EGRESOS_BG;

      const tRow = ws.addRow([title]);
      const tCell = tRow.getCell(1);
      tCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      tCell.alignment = { vertical: "middle", horizontal: "left" };
      setFill(tCell, sectionBg);
      addBorder(tCell);
      ws.mergeCells(tRow.number, 1, tRow.number, COL_COUNT);

      const thRow = ws.addRow(EP_HEADERS);
      thRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      thRow.eachCell({ includeEmpty: true }, (cell) => {
        setFill(cell, sectionBg);
        addBorder(cell);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      for (const row of sectionRows) {
        const isPago = row.fuente === "Complemento P";
        const dr = ws.addRow([
          row.fuente,
          row.uuid,
          row.uuidDocumentoRelacionado || "",
          row.fechaEmision,
          row.fechaPago ?? null,
          rfcDisplay(row.RFC_emisor),
          rfcAlias(row.RFC_emisor) ?? (row.RazonSocialEmisor || row.RFC_emisor),
          rfcDisplay(row.RFC_receptor),
          rfcAlias(row.RFC_receptor) ?? (row.RazonSocialReceptor || row.RFC_receptor),
          row.formaPago || "",
          row.moneda,
          row.tc,
          row.subtotalMx,
          row.ivaMx,
          row.retIsrMx,
          row.retIvaMx,
          row.totalMx,
        ]);

        dr.getCell(4).numFmt = DATE_FMT;
        if (isPago && row.fechaPago) dr.getCell(5).numFmt = DATE_FMT;
        dr.getCell(12).numFmt = TC_FMT;

        dr.eachCell({ includeEmpty: true }, (cell, ci) => {
          addBorder(cell);
          if (ci >= 13 && ci <= 17) cell.numFmt = MXN_FMT;
        });
      }

      const totSubtotal = sectionRows.reduce((s, r) => s + r.subtotalMx, 0);
      const totIva = sectionRows.reduce((s, r) => s + r.ivaMx, 0);
      const totRetISR = sectionRows.reduce((s, r) => s + r.retIsrMx, 0);
      const totRetIVA = sectionRows.reduce((s, r) => s + r.retIvaMx, 0);
      const totTotal = sectionRows.reduce((s, r) => s + r.totalMx, 0);

      const totRow = ws.addRow([
        `TOTAL ${title}`, null, null, null, null, null, null, null, null, null, null, null,
        totSubtotal, totIva, totRetISR, totRetIVA, totTotal,
      ]);
      totRow.font = { bold: true };
      totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        addBorder(cell);
        setFill(cell, HEADER_BG);
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        if (ci >= 13 && ci <= 17) cell.numFmt = MXN_FMT;
      });

      ws.addRow([]);
    };

    writeSection("INGRESOS", ingresos);
    writeSection("EGRESOS", egresos);

    const sumSection = (rowsToSum: typeof normalizedRows) => ({
      subtotal: rowsToSum.reduce((s, r) => s + r.subtotalMx, 0),
      iva: rowsToSum.reduce((s, r) => s + r.ivaMx, 0),
      retISR: rowsToSum.reduce((s, r) => s + r.retIsrMx, 0),
      retIVA: rowsToSum.reduce((s, r) => s + r.retIvaMx, 0),
      total: rowsToSum.reduce((s, r) => s + r.totalMx, 0),
    });

    const sumIngresos = sumSection(ingresos);
    const sumEgresos = sumSection(egresos);

    const grandSubtotal = sumIngresos.subtotal - sumEgresos.subtotal;
    const grandIva = sumIngresos.iva - sumEgresos.iva;
    const grandRetISR = sumIngresos.retISR - sumEgresos.retISR;
    const grandRetIVA = sumIngresos.retIVA - sumEgresos.retIVA;
    const grandTotal = sumIngresos.total - sumEgresos.total;

    const grandRow = ws.addRow([
      "TOTAL GENERAL", null, null, null, null, null, null, null, null, null, null, null,
      grandSubtotal, grandIva, grandRetISR, grandRetIVA, grandTotal,
    ]);
    grandRow.font = { bold: true };
    grandRow.eachCell({ includeEmpty: true }, (cell, ci) => {
      addBorder(cell);
      setFill(cell, HEADER_BG);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      if (ci >= 13 && ci <= 17) cell.numFmt = MXN_FMT;
    });

    const buf = await wb.xlsx.writeBuffer();
    const pad = (n: number) => String(n).padStart(2, "0");
    const periodLabel = dateFromP && dateToP
      ? `${dateFromP}_${dateToP}`
      : quarterP !== null
        ? `Q${parseInt(quarterP, 10)}-${year}`
        : monthP !== null
          ? `${pad(parseInt(monthP, 10))}-${year}`
          : String(year);
    const fileName = `Flujo_${rfc}_${periodLabel}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        ...(demoDownloadLimit ? { "Set-Cookie": demoDownloadLimit.setCookie } : {}),
      },
    });
  } catch (err) {
    console.error("[export/Flujo]", (err as Error).message);
    return new Response("Error al generar el reporte", { status: 503 });
  }
}
