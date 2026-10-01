// 05 §0 rate limits — in-memory token bucket per key (no paid service). Per process: fine for the single-instance MVP.
import { AppError } from "../errors.ts";

export type RateRule = { name: string; capacity: number; perMs: number };

const MINUTE = 60_000;
/** auth 10/min/IP · LIFF slot search 30/min/user · everything else 120/min/session */
export const RATE_RULES = {
  auth: { name: "auth", capacity: 10, perMs: MINUTE },
  liffSlotSearch: { name: "liffSlotSearch", capacity: 30, perMs: MINUTE },
  default: { name: "default", capacity: 120, perMs: MINUTE },
} as const satisfies Record<string, RateRule>;

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

/** Keep memory bounded: buckets idle for a full window are back at capacity, so dropping them changes nothing. */
const MAX_BUCKETS = 50_000;
function prune(t: number): void {
  for (const [k, b] of buckets) if (t - b.updatedAt >= MINUTE) buckets.delete(k);
}

/** Takes one token for `subject` under `rule`; empty bucket → RATE_LIMITED. Refills continuously (capacity per perMs). */
export function consume(rule: RateRule, subject: string, now: Date): void {
  const key = `${rule.name}:${subject}`;
  const t = now.getTime();
  if (buckets.size > MAX_BUCKETS) prune(t);
  const b = buckets.get(key) ?? { tokens: rule.capacity, updatedAt: t };
  const refilled = Math.min(rule.capacity, b.tokens + (Math.max(0, t - b.updatedAt) * rule.capacity) / rule.perMs);
  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: t });
    throw new AppError("RATE_LIMITED");
  }
  buckets.set(key, { tokens: refilled - 1, updatedAt: t });
}

/** Picks the 05 §0 rule for this request and the key it is counted against. */
export function ruleFor(key: string, pathname: string, who: { ip: string | null; sessionId: string | null; actorId: string | null }) {
  const ip = who.ip ?? "unknown";
  if (pathname.startsWith("/api/v1/auth/")) return { rule: RATE_RULES.auth, subject: `ip:${ip}` };
  if (key === "liff.groomSlots") return { rule: RATE_RULES.liffSlotSearch, subject: `user:${who.actorId ?? who.sessionId ?? ip}` };
  return { rule: RATE_RULES.default, subject: who.sessionId ? `session:${who.sessionId}` : `ip:${ip}` };
}

/** Tests only. */
export function resetRateLimits(): void {
  buckets.clear();
}
