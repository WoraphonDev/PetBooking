// Request helpers: cookies, client ip/user-agent, CSRF origin check (01 §4 step 5, §10).
import { AppError } from "../errors.ts";

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** First hop of x-forwarded-for (set by the hosting proxy), else x-real-ip. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const isWrite = (req: Request) => !SAFE_METHODS.has(req.method.toUpperCase());

/** Webhooks (signature) and cron (secret) authenticate themselves and are called cross-origin. */
const CSRF_EXEMPT = ["/api/webhooks/", "/api/cron/"];

/** method ≠ GET → Origin must equal APP_BASE_URL's origin. */
export function assertSameOrigin(req: Request): void {
  if (!isWrite(req)) return;
  const path = new URL(req.url).pathname;
  if (CSRF_EXEMPT.some((p) => path.startsWith(p))) return;
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  const origin = req.headers.get("origin");
  // Q-0006: 05 §1 has no dedicated CSRF code → FORBIDDEN
  if (!origin || origin !== new URL(base).origin) throw new AppError("FORBIDDEN");
}
