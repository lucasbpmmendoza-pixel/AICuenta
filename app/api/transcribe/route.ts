import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSession } from "@/lib/session";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper accepts up to 25 MB

const FISCAL_PROMPT =
  "Transcripción en español de México sobre temas fiscales y contables. Términos comunes: SAT, CFDI, RFC, ISR, IVA, IEPS, DIOT, retenciones, complemento de pago, factura, nómina, deducible, acreditable, régimen, cédula fiscal, constancia de situación fiscal.";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato inválido. Usa multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Falta el campo 'file' con el audio." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El audio está vacío." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "El audio supera el límite de 25 MB." }, { status: 413 });
  }

  const fileName =
    file instanceof File && file.name ? file.name : `audio_${Date.now()}.webm`;
  const audio = new File([file], fileName, { type: file.type || "audio/webm" });

  try {
    const t0 = Date.now();
    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
      language: "es",
      prompt: FISCAL_PROMPT,
      response_format: "json",
    });
    const text = (transcription.text ?? "").trim();
    console.log(`[transcribe] ok bytes=${file.size} ms=${Date.now() - t0} chars=${text.length}`);
    return NextResponse.json({ text });
  } catch (err) {
    const message = (err as Error).message ?? "Error al transcribir";
    console.error("[transcribe] error:", message);
    return NextResponse.json({ error: "No se pudo transcribir el audio." }, { status: 500 });
  }
}
