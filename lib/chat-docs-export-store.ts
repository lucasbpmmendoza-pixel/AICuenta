import crypto from "crypto";

const EXPORT_TTL_MS = 10 * 60 * 1000;

type ChatDocsExportEntry = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  expiresAt: number;
};

const store = new Map<string, ChatDocsExportEntry>();

function purgeExpiredEntries(now: number): void {
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(token);
    }
  }
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!cleaned) return "reporte_docs.xlsx";
  return cleaned.toLowerCase().endsWith(".xlsx") ? cleaned : `${cleaned}.xlsx`;
}

export function createChatDocsExport(buffer: Buffer, fileName: string) {
  const now = Date.now();
  purgeExpiredEntries(now);

  const token = crypto.randomUUID();
  const expiresAt = now + EXPORT_TTL_MS;
  const safeFileName = sanitizeFileName(fileName);

  store.set(token, {
    fileName: safeFileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
    expiresAt,
  });

  return {
    token,
    fileName: safeFileName,
    url: `/api/chat-docs/export/${token}`,
    expiresAt,
  };
}

export function getChatDocsExport(token: string): ChatDocsExportEntry | null {
  const now = Date.now();
  const entry = store.get(token);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    store.delete(token);
    return null;
  }

  return entry;
}

export function createChatExport(buffer: Buffer, fileName: string, basePath: string) {
  const created = createChatDocsExport(buffer, fileName);
  return {
    ...created,
    url: `${basePath}/${created.token}`,
  };
}

export function getChatExport(token: string): ChatDocsExportEntry | null {
  return getChatDocsExport(token);
}
