// Descarga páginas web y las convierte a texto plano para que las pueda leer un LLM.
// Pensado para uso desde tools de chat (FiscalGPT). Trae guardas contra SSRF:
// resuelve el hostname antes de pegarle y bloquea IPs privadas/loopback, y sigue
// los redirects manualmente revalidando cada salto.

import { lookup } from "dns/promises";

const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 10_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "AICuentaBot/1.0 (+FiscalGPT)";

export type WebFetchSuccess = {
  url: string;
  final_url: string;
  title: string | null;
  content: string;
  content_type: string;
  truncated: boolean;
  bytes: number;
};

export type WebFetchError = { error: string };

export type WebFetchResult = WebFetchSuccess | WebFetchError;

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n < 0 || n > 255)) return true;
  if (o[0] === 10) return true;
  if (o[0] === 127) return true;
  if (o[0] === 0) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] >= 224) return true; // multicast / reservado
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

async function assertSafeHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Sólo se permiten URLs http o https");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname) throw new Error("URL sin hostname");
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Hostname bloqueado por seguridad");
  }

  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error("No se pudo resolver el dominio");
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) {
      throw new Error("La URL apunta a una IP interna y está bloqueada");
    }
    if (a.family === 6 && isPrivateIPv6(a.address)) {
      throw new Error("La URL apunta a una IP interna y está bloqueada");
    }
  }
}

async function fetchOnce(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWebPage(rawUrl: string): Promise<WebFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { error: "URL inválida" };
  }

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertSafeHost(current);
    } catch (err) {
      return { error: (err as Error).message };
    }

    let res: Response;
    try {
      res = await fetchOnce(current);
    } catch (err) {
      return { error: `No se pudo descargar la página: ${(err as Error).message}` };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { error: `Redirect HTTP ${res.status} sin Location` };
      try {
        current = new URL(loc, current);
      } catch {
        return { error: "Redirect con Location inválido" };
      }
      continue;
    }

    response = res;
    break;
  }

  if (!response) return { error: "Demasiados redirects" };
  if (!response.ok) return { error: `La página respondió con HTTP ${response.status}` };

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    return { error: `Tipo de contenido no soportado (${contentType || "desconocido"})` };
  }

  const lenHeader = response.headers.get("content-length");
  if (lenHeader) {
    const declared = parseInt(lenHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return { error: `Documento demasiado grande (${declared} bytes, máximo ${MAX_BYTES})` };
    }
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return { error: `Documento demasiado grande (${buf.byteLength} bytes, máximo ${MAX_BYTES})` };
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const isHtml = /text\/html|application\/xhtml/i.test(contentType);
  const title = isHtml ? extractTitle(html) : null;
  const text = isHtml ? htmlToText(html) : html.trim();
  const truncated = text.length > MAX_TEXT_CHARS;
  const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

  return {
    url: rawUrl,
    final_url: current.toString(),
    title,
    content: finalText,
    content_type: contentType,
    truncated,
    bytes: buf.byteLength,
  };
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const cleaned = decodeEntities(m[1].replace(/\s+/g, " ").trim());
  return cleaned.length > 0 ? cleaned : null;
}

function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/gi, "");

  s = s.replace(/<\s*(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(
    /<\/\s*(p|div|li|tr|h[1-6]|article|section|header|footer|nav|ul|ol|table|blockquote|pre)\s*>/gi,
    "\n",
  );
  s = s.replace(/<[^>]+>/g, "");

  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/ ?\n ?/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iquest: "¿", iexcl: "¡",
  ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  middot: "·", deg: "°", euro: "€", trade: "™", copy: "©", reg: "®",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function safeFromCodePoint(code: number): string {
  if (code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
