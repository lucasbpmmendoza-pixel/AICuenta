import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CEDULA_MODEL = process.env.CEDULA_FISCAL_MODEL ?? "gpt-4o-mini";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_MIME: Record<string, "pdf" | "image"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
};

const EXTRACTION_PROMPT = `Eres un extractor de datos de cédulas de identificación fiscal del SAT (México).
Recibirás una cédula fiscal (CIF) en PDF o imagen. Devuelve EXCLUSIVAMENTE un JSON valido (sin texto adicional, sin markdown, sin backticks) con la siguiente forma exacta:

{
  "rfc": "",
  "curp": "",
  "nombre": "",
  "razon_social": "",
  "tipo_persona": "fisica" | "moral" | "",
  "fecha_inicio_operaciones": "",
  "situacion_contribuyente": "",
  "fecha_ultimo_cambio_estado": "",
  "nombre_comercial": "",
  "regimenes": [
    { "regimen": "", "fecha_alta": "" }
  ],
  "actividades_economicas": [
    { "actividad": "", "porcentaje": "", "fecha_inicio": "" }
  ],
  "obligaciones": [
    { "descripcion": "", "vencimiento": "", "fecha_inicio": "", "fecha_fin": "" }
  ],
  "domicilio": {
    "codigo_postal": "",
    "calle": "",
    "numero_exterior": "",
    "numero_interior": "",
    "colonia": "",
    "municipio": "",
    "estado": "",
    "entre_calles": "",
    "tipo_vialidad": ""
  },
  "fecha_emision_cif": "",
  "idcif": ""
}

Reglas:
- Si un campo no aparece en la cédula, déjalo como cadena vacía "" o arreglo vacío [].
- No inventes datos.
- Fechas en formato YYYY-MM-DD cuando sea posible.
- El RFC debe estar en MAYÚSCULAS, sin espacios.
- Devuelve solo el JSON, nada más.`;

interface CedulaData {
  rfc?: string;
  curp?: string;
  nombre?: string;
  razon_social?: string;
  tipo_persona?: string;
  fecha_inicio_operaciones?: string;
  situacion_contribuyente?: string;
  fecha_ultimo_cambio_estado?: string;
  nombre_comercial?: string;
  regimenes?: Array<{ regimen?: string; fecha_alta?: string }>;
  actividades_economicas?: Array<{ actividad?: string; porcentaje?: string; fecha_inicio?: string }>;
  obligaciones?: Array<{ descripcion?: string; vencimiento?: string; fecha_inicio?: string; fecha_fin?: string }>;
  domicilio?: {
    codigo_postal?: string;
    calle?: string;
    numero_exterior?: string;
    numero_interior?: string;
    colonia?: string;
    municipio?: string;
    estado?: string;
    entre_calles?: string;
    tipo_vialidad?: string;
  };
  fecha_emision_cif?: string;
  idcif?: string;
}

function cleanJsonResponse(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1);
  }
  return text;
}

function buildTitulo(data: CedulaData): string {
  const nombre = (data.razon_social || data.nombre || "").trim();
  const rfc = (data.rfc || "").trim().toUpperCase();
  if (nombre && rfc) return `Cédula Fiscal - ${nombre} (${rfc})`;
  if (rfc) return `Cédula Fiscal - ${rfc}`;
  if (nombre) return `Cédula Fiscal - ${nombre}`;
  return `Cédula Fiscal - ${new Date().toISOString().slice(0, 10)}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

function toStringOrNull(value: unknown, max?: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: Request) {
  const reqId = `cedula_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.isDemo) {
    return NextResponse.json({ error: "Funcionalidad no disponible en modo demo" }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo enviado" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Debes adjuntar la cédula fiscal (PDF o imagen)" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)` },
      { status: 400 },
    );
  }

  const mime = (file.type || "").toLowerCase();
  const kind = ALLOWED_MIME[mime];
  if (!kind) {
    return NextResponse.json(
      { error: "Formato no soportado. Sube PDF, PNG, JPG o WEBP." },
      { status: 400 },
    );
  }

  const ownerId = session.ownerId ?? session.sub;
  console.log(`[cedula-fiscal][${reqId}] start size=${file.size} mime=${mime} user=${session.sub}`);

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const contentPart: ChatCompletionContentPart =
    kind === "pdf"
      ? {
          type: "file",
          file: {
            filename: file.name || "cedula-fiscal.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
        }
      : {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${base64}` },
        };

  let data: CedulaData;
  let rawResponse = "";
  try {
    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model: CEDULA_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae los datos de la siguiente cédula fiscal." },
            contentPart,
          ],
        },
      ],
    });
    console.log(`[cedula-fiscal][${reqId}] openai_ms=${Date.now() - t0}`);

    rawResponse = completion.choices[0]?.message?.content?.toString() ?? "";
    if (!rawResponse) {
      throw new Error("Respuesta vacía del modelo");
    }
    data = JSON.parse(cleanJsonResponse(rawResponse)) as CedulaData;
  } catch (err) {
    console.error(`[cedula-fiscal][${reqId}] openai_error:`, (err as Error).message);
    return NextResponse.json(
      { error: "No se pudieron extraer los datos. Verifica que el archivo sea una cédula fiscal legible." },
      { status: 502 },
    );
  }

  if (!data.rfc || data.rfc.trim().length < 10) {
    return NextResponse.json(
      { error: "No se detectó un RFC en el documento. ¿Subiste la cédula fiscal correcta?" },
      { status: 422 },
    );
  }

  const rfcUpper = data.rfc.trim().toUpperCase();
  data.rfc = rfcUpper;

  const titulo = buildTitulo(data);
  const dom = data.domicilio ?? {};

  let cedulaId: number;
  let updated = false;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("user_id", ownerId)
      .input("rfc", rfcUpper)
      .input("curp", toStringOrNull(data.curp, 18))
      .input("nombre", toStringOrNull(data.nombre, 300))
      .input("razon_social", toStringOrNull(data.razon_social, 300))
      .input("tipo_persona", toStringOrNull(data.tipo_persona, 20))
      .input("nombre_comercial", toStringOrNull(data.nombre_comercial, 300))
      .input("fecha_inicio_operaciones", toDateOrNull(data.fecha_inicio_operaciones))
      .input("situacion_contribuyente", toStringOrNull(data.situacion_contribuyente, 100))
      .input("fecha_ultimo_cambio_estado", toDateOrNull(data.fecha_ultimo_cambio_estado))
      .input("fecha_emision_cif", toDateOrNull(data.fecha_emision_cif))
      .input("idcif", toStringOrNull(data.idcif, 50))
      .input("codigo_postal", toStringOrNull(dom.codigo_postal, 10))
      .input("calle", toStringOrNull(dom.calle, 200))
      .input("numero_exterior", toStringOrNull(dom.numero_exterior, 20))
      .input("numero_interior", toStringOrNull(dom.numero_interior, 20))
      .input("colonia", toStringOrNull(dom.colonia, 150))
      .input("municipio", toStringOrNull(dom.municipio, 150))
      .input("estado", toStringOrNull(dom.estado, 100))
      .input("entre_calles", toStringOrNull(dom.entre_calles, 300))
      .input("tipo_vialidad", toStringOrNull(dom.tipo_vialidad, 50))
      .input("regimenes", JSON.stringify(data.regimenes ?? []))
      .input("actividades_economicas", JSON.stringify(data.actividades_economicas ?? []))
      .input("obligaciones", JSON.stringify(data.obligaciones ?? []))
      .input("raw_json", JSON.stringify(data))
      .query<{ id: number; action: "INSERT" | "UPDATE" }>(`
        DECLARE @output TABLE (id INT, action NVARCHAR(10));

        MERGE cedulas_fiscales AS target
        USING (SELECT @user_id AS user_id, @rfc AS rfc) AS source
          ON target.user_id = source.user_id AND target.rfc = source.rfc
        WHEN MATCHED THEN
          UPDATE SET
            curp                       = @curp,
            nombre                     = @nombre,
            razon_social               = @razon_social,
            tipo_persona               = @tipo_persona,
            nombre_comercial           = @nombre_comercial,
            fecha_inicio_operaciones   = @fecha_inicio_operaciones,
            situacion_contribuyente    = @situacion_contribuyente,
            fecha_ultimo_cambio_estado = @fecha_ultimo_cambio_estado,
            fecha_emision_cif          = @fecha_emision_cif,
            idcif                      = @idcif,
            codigo_postal              = @codigo_postal,
            calle                      = @calle,
            numero_exterior            = @numero_exterior,
            numero_interior            = @numero_interior,
            colonia                    = @colonia,
            municipio                  = @municipio,
            estado                     = @estado,
            entre_calles               = @entre_calles,
            tipo_vialidad              = @tipo_vialidad,
            regimenes                  = @regimenes,
            actividades_economicas     = @actividades_economicas,
            obligaciones               = @obligaciones,
            raw_json                   = @raw_json,
            activo                     = 1
        WHEN NOT MATCHED THEN
          INSERT (
            user_id, rfc, curp, nombre, razon_social, tipo_persona, nombre_comercial,
            fecha_inicio_operaciones, situacion_contribuyente, fecha_ultimo_cambio_estado,
            fecha_emision_cif, idcif,
            codigo_postal, calle, numero_exterior, numero_interior, colonia, municipio,
            estado, entre_calles, tipo_vialidad,
            regimenes, actividades_economicas, obligaciones, raw_json
          )
          VALUES (
            @user_id, @rfc, @curp, @nombre, @razon_social, @tipo_persona, @nombre_comercial,
            @fecha_inicio_operaciones, @situacion_contribuyente, @fecha_ultimo_cambio_estado,
            @fecha_emision_cif, @idcif,
            @codigo_postal, @calle, @numero_exterior, @numero_interior, @colonia, @municipio,
            @estado, @entre_calles, @tipo_vialidad,
            @regimenes, @actividades_economicas, @obligaciones, @raw_json
          )
        OUTPUT INSERTED.id, $action INTO @output;

        SELECT id, action FROM @output;
      `);
    const row = result.recordset[0];
    cedulaId = row?.id ?? 0;
    updated = row?.action === "UPDATE";
  } catch (err) {
    console.error(`[cedula-fiscal][${reqId}] db_error:`, (err as Error).message);
    return NextResponse.json(
      { error: "No se pudo guardar la cédula en la base de datos." },
      { status: 500 },
    );
  }

  console.log(`[cedula-fiscal][${reqId}] saved id=${cedulaId} rfc=${rfcUpper} action=${updated ? "update" : "insert"}`);

  return NextResponse.json({
    ok: true,
    cedulaId,
    updated,
    titulo,
    rfc: rfcUpper,
    data,
  });
}
