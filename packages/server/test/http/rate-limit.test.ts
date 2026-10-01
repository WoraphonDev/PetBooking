// T-0007: 05 §0 rate limits — token bucket per key, and RATE_LIMITED through the wrappers.
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../src/errors.ts";
import { consume, ruleFor } from "../../src/http/rate-limit.ts";
import { RATE_RULES, resetRateLimits, withPublic } from "../../src/http.ts";

const T0 = new Date("2026-10-05T03:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function burst(rule: (typeof RATE_RULES)[keyof typeof RATE_RULES], subject: string, n: number, now = T0): number {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      consume(rule, subject, now);
      ok++;
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("RATE_LIMITED");
    }
  }
  return ok;
}

beforeEach(() => resetRateLimits());

describe("token bucket", () => {
  it.each([
    ["auth", RATE_RULES.auth, 10],
    ["liffSlotSearch", RATE_RULES.liffSlotSearch, 30],
    ["default", RATE_RULES.default, 120],
  ])("%s allows %#→ capacity per minute then RATE_LIMITED", (_name, rule, capacity) => {
    expect(rule.capacity).toBe(capacity);
    expect(burst(rule, "k", capacity + 5)).toBe(capacity);
  });

  it("refills over time (full after a minute, proportionally before)", () => {
    expect(burst(RATE_RULES.auth, "ip:1", 10)).toBe(10);
    expect(burst(RATE_RULES.auth, "ip:1", 1, at(5_999))).toBe(0);
    expect(burst(RATE_RULES.auth, "ip:1", 2, at(6_000))).toBe(1);
    expect(burst(RATE_RULES.auth, "ip:1", 20, at(120_000))).toBe(10);
  });

  it("keys are independent", () => {
    expect(burst(RATE_RULES.auth, "ip:1", 10)).toBe(10);
    expect(burst(RATE_RULES.auth, "ip:2", 1)).toBe(1);
    expect(burst(RATE_RULES.default, "ip:1", 1)).toBe(1);
  });
});

describe("ruleFor (05 §0)", () => {
  const who = { ip: "1.2.3.4", sessionId: "s1", actorId: "c1" };
  it("auth namespace → per IP", () => {
    expect(ruleFor("auth.staffLogin", "/api/v1/auth/staff/login", who)).toEqual({ rule: RATE_RULES.auth, subject: "ip:1.2.3.4" });
    expect(ruleFor("admin.login", "/api/v1/auth/admin/login", who).rule).toBe(RATE_RULES.auth);
  });
  it("LIFF slot search → per user", () => {
    expect(ruleFor("liff.groomSlots", "/api/v1/liff/x/availability/groom-slots", who)).toEqual({
      rule: RATE_RULES.liffSlotSearch,
      subject: "user:c1",
    });
  });
  it("everything else → per session (per IP without one)", () => {
    expect(ruleFor("branch.get", "/api/v1/staff/branch", who)).toEqual({ rule: RATE_RULES.default, subject: "session:s1" });
    expect(ruleFor("public.branch", "/api/v1/public/branches/x", { ...who, sessionId: null })).toEqual({
      rule: RATE_RULES.default,
      subject: "ip:1.2.3.4",
    });
  });
});

describe("through the wrapper", () => {
  it("11th login from one IP within a minute → 429 RATE_LIMITED; another IP unaffected", async () => {
    process.env.APP_BASE_URL = "https://app.test";
    const h = withPublic("auth.staffLogin", {}, async () => ({ ok: true }));
    const call = (ip: string) =>
      h(
        new Request("https://app.test/api/v1/auth/staff/login", {
          method: "POST",
          headers: { origin: "https://app.test", "x-forwarded-for": ip },
          body: "{}",
        }),
      );
    for (let i = 0; i < 10; i++) expect((await call("9.9.9.9")).status).toBe(200);
    const res = await call("9.9.9.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "ทำรายการถี่เกินไป กรุณารอสักครู่", details: {} } });
    expect((await call("8.8.8.8")).status).toBe(200);
  });
});
