/**
 * Cliente del servicio aicuenta-storage (FastAPI en Ubuntu).
 *
 * Reemplaza a @vercel/blob para los archivos sensibles de e.firma
 * (.cer/.key/efiel.txt). El servicio destino corre en el mismo Ubuntu
 * que el worker `index.mjs`, asi que los archivos aterrizan directo en
 * el disco que el worker lee.
 *
 * Variables de entorno requeridas:
 *   RFC_STORAGE_URL      Ej: https://storage.tu-dominio.com
 *   RFC_STORAGE_API_KEY  Llave compartida con el servicio Python.
 */

interface StorageConfig {
  url: string;
  apiKey: string;
}

function getConfig(): StorageConfig {
  const url = process.env.RFC_STORAGE_URL?.trim();
  const apiKey = process.env.RFC_STORAGE_API_KEY?.trim();

  if (!url) {
    throw new Error("RFC_STORAGE_URL no esta configurado");
  }
  if (!apiKey) {
    throw new Error("RFC_STORAGE_API_KEY no esta configurado");
  }
  return { url: url.replace(/\/+$/, ""), apiKey };
}

export interface UploadRfcArgs {
  rfc: string;
  efiel: string;
  cer: File;
  key: File;
}

export interface UploadRfcResponse {
  ok: boolean;
  rfc: string;
  files: { cer: string; key: string; efiel: string };
  bytes: { cer: number; key: number; efiel: number };
}

/**
 * Sube los 3 archivos al servicio. Lanza Error si el servicio no responde 2xx.
 */
export async function uploadRfcFiles(args: UploadRfcArgs): Promise<UploadRfcResponse> {
  const { url, apiKey } = getConfig();

  const fd = new FormData();
  fd.append("rfc", args.rfc);
  fd.append("efiel", args.efiel);
  fd.append("cer", args.cer);
  fd.append("key", args.key);

  const res = await fetch(`${url}/upload/rfc`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: fd,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rfc-storage upload fallo ${res.status}: ${detail.slice(0, 200)}`);
  }

  return (await res.json()) as UploadRfcResponse;
}

/**
 * Elimina la carpeta del RFC en el storage. Idempotente: si no existia,
 * tambien resuelve OK.
 */
export async function deleteRfcFiles(rfc: string): Promise<void> {
  const { url, apiKey } = getConfig();

  const res = await fetch(`${url}/upload/rfc/${encodeURIComponent(rfc)}`, {
    method: "DELETE",
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rfc-storage delete fallo ${res.status}: ${detail.slice(0, 200)}`);
  }
}
