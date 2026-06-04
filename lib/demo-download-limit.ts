import type { NextRequest } from "next/server";

export const DEMO_DOWNLOAD_LIMIT = 6;
export const DEMO_DOWNLOAD_WINDOW_MINUTES = 15;

const WINDOW_MS = DEMO_DOWNLOAD_WINDOW_MINUTES * 60 * 1000;
const COOKIE_NAME = "demo_download_window";

export type DemoDownloadLimitResult = {
  allowed: boolean;
  remaining: number;
  total: number;
  retryAfterSeconds: number;
  setCookie: string;
};

export function formatRetryAfter(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function serializeCookie(value: string): string {
  const maxAge = Math.ceil(WINDOW_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

function parseTimestamps(raw: string | undefined, now: number): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => Number(item))
    .filter((ts) => Number.isFinite(ts) && ts > 0 && now - ts < WINDOW_MS)
    .sort((a, b) => a - b);
}

export function consumeDemoDownloadSlot(req: NextRequest): DemoDownloadLimitResult {
  const now = Date.now();
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const timestamps = parseTimestamps(raw, now);

  if (timestamps.length >= DEMO_DOWNLOAD_LIMIT) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      total: timestamps.length,
      retryAfterSeconds,
      setCookie: serializeCookie(timestamps.join(",")),
    };
  }

  timestamps.push(now);
  const total = timestamps.length;
  return {
    allowed: true,
    remaining: Math.max(DEMO_DOWNLOAD_LIMIT - total, 0),
    total,
    retryAfterSeconds: 0,
    setCookie: serializeCookie(timestamps.join(",")),
  };
}