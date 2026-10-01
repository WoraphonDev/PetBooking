// T-0007: with{Staff,Customer,Admin,Public} pipeline (01 §4) — every error path with simulated Requests.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Warning } from "@app/contracts/common";
import type { SessionSubject } from "@app/contracts/enums";
import { organization, ownerProfile, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessionCookie } from "../../src/auth/cookies.ts";
import { createSession } from "../../src/auth/session.ts";
import { AppError } from "../../src/errors.ts";
import { type ParseSchema, resetRateLimits, withAdmin, withCustomer, withPublic, withStaff } from "../../src/http.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../helpers/setup.ts";

const errorsVector: { errors: { code: string; http: number; messageTh: string }[] } = JSON.parse(
  readFileSync(new URL("../../../../docs/spec/vectors/errors.json", import.meta.url), "utf8"),
);

const BASE = "https://app.test";
const COOKIE = { staff: "sid", customer: "cid", platform_admin: "aid" } as const;

let env: TestEnv;
let other: SeedOrg;

beforeAll(async () => {
  process.env.APP_BASE_URL = BASE;
  env = await setupTestDb();
  other = await seedOrg(env.db, "b");
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

async function login(
  subjectType: SessionSubject,
  subjectId: string,
  extra: { organizationId?: string; branchId?: string; supportAccessLogId?: string } = {},
  at = new Date(),
) {
  const { token } = await createSession(env.db, { subjectType, subjectId, ...extra }, at);
  return `${COOKIE[subjectType]}=${token}`;
}

function req(path: string, init: { method?: string; cookie?: string; origin?: string | null; body?: string } = {}) {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { "x-forwarded-for": "10.0.0.1" };
  if (init.cookie) headers.cookie = init.cookie;
  const origin = init.origin === undefined ? BASE : init.origin;
  if (origin && method !== "GET") headers.origin = origin;
  return new Request(`${BASE}${path}`, { method, headers, body: init.body ?? (method === "GET" ? null : "{}") });
}

const ctxOf = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

async function expectError(res: Response, code: string) {
  const vector = errorsVector.errors.find((e) => e.code === code);
  expect(vector, code).toBeDefined();
  expect(res.status).toBe(vector?.http);
  expect(await res.json()).toEqual({ error: { code, message: vector?.messageTh, details: expect.any(Object) } });
}

const echo = async (ctx: unknown, input: unknown) => ({ ctx, input });
type EchoBody = { ctx: { actor: { type: string; id: string | null; role?: string }; orgId: string | null; branchId: string | null } };

describe("withStaff", () => {
  const get = withStaff("branch.get", {}, echo);
  const ownerOnlyPost = withStaff("branch.update", { body: Warning }, echo);

  it("builds ctx from the sid session (200)", async () => {
    const res = await get(
      req("/api/v1/staff/branch", { cookie: await login("staff", env.base.staff.staff, { organizationId: env.base.orgId }) }),
      ctxOf(),
    );
    expect(res.status).toBe(200);
    const { ctx } = (await res.json()) as EchoBody;
    expect(ctx.actor).toEqual({ type: "staff", id: env.base.staff.staff, role: "staff" });
    expect(ctx.orgId).toBe(env.base.orgId);
    expect(ctx.branchId).toBe(env.base.branchId);
  });

  it("returns 204 when the service returns nothing", async () => {
    const h = withStaff("auth.staffLogout", {}, async () => undefined);
    const res = await h(
      req("/api/v1/auth/staff/logout", {
        method: "POST",
        cookie: await login("staff", env.base.staff.owner, { organizationId: env.base.orgId }),
      }),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("no cookie / unknown token / expired / wrong subject → UNAUTHENTICATED", async () => {
    await expectError(await get(req("/api/v1/staff/branch")), "UNAUTHENTICATED");
    await expectError(await get(req("/api/v1/staff/branch", { cookie: "sid=nope" })), "UNAUTHENTICATED");
    const expired = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId }, new Date(Date.now() - 31 * 86_400_000));
    await expectError(await get(req("/api/v1/staff/branch", { cookie: expired })), "UNAUTHENTICATED");
    const asCustomer = await login("customer", env.base.ownerProfileId, { organizationId: env.base.orgId, branchId: env.base.branchId });
    await expectError(await get(req("/api/v1/staff/branch", { cookie: asCustomer.replace("cid=", "sid=") })), "UNAUTHENTICATED");
  });

  it("suspended organization → FORBIDDEN", async () => {
    const s = await seedOrg(env.db, "susp");
    await env.db.update(organization).set({ status: "suspended" }).where(eq(organization.id, s.orgId));
    await expectError(
      await get(req("/api/v1/staff/branch", { cookie: await login("staff", s.staff.owner, { organizationId: s.orgId }) })),
      "FORBIDDEN",
    );
  });

  it("role not in the permission matrix → FORBIDDEN", async () => {
    const cookie = await login("staff", env.base.staff.front_desk, { organizationId: env.base.orgId });
    await expectError(await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body: "{}" })), "FORBIDDEN");
  });

  it("support session: GET allowed, writes → SUPPORT_READ_ONLY", async () => {
    const cookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId, supportAccessLogId: randomUUID() });
    expect((await get(req("/api/v1/staff/branch", { cookie }))).status).toBe(200);
    const body = JSON.stringify({ code: "X", message: "m", data: null });
    await expectError(await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body })), "SUPPORT_READ_ONLY");
  });

  it("CSRF: write without Origin or with a foreign Origin → FORBIDDEN", async () => {
    const cookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId });
    const body = JSON.stringify({ code: "X", message: "m", data: null });
    await expectError(await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body, origin: null })), "FORBIDDEN");
    await expectError(
      await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body, origin: "https://evil.test" })),
      "FORBIDDEN",
    );
    expect((await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body }))).status).toBe(200);
  });

  it("zod failure → VALIDATION_FAILED with details.fields; bad JSON too", async () => {
    const cookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId });
    const res = await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body: JSON.stringify({ code: 1 }) }));
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string; details: { fields: Record<string, string> } } };
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(json.error.details.fields).sort()).toEqual(["code", "data", "message"]);
    await expectError(
      await ownerOnlyPost(req("/api/v1/staff/branch", { method: "PATCH", cookie, body: "{not json" })),
      "VALIDATION_FAILED",
    );
  });

  it("merges body/query/params; path params win over body", async () => {
    const params: ParseSchema<{ id: string }> = {
      safeParse: (d) => ({ success: true, data: { id: String((d as { id: string }).id) } }),
    };
    const query: ParseSchema<{ q: string[] }> = {
      safeParse: (d) => ({ success: true, data: { q: [(d as { q: string | string[] }).q].flat() } }),
    };
    const h = withStaff(
      "branch.update",
      { body: { safeParse: (d: unknown) => ({ success: true as const, data: d as object }) }, query, params },
      echo,
    );
    const cookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId });
    const res = await h(
      req("/api/v1/staff/x?q=a&q=b", { method: "POST", cookie, body: JSON.stringify({ id: "body", n: 1 }) }),
      ctxOf({ id: "path" }),
    );
    expect(((await res.json()) as { input: unknown }).input).toEqual({ id: "path", n: 1, q: ["a", "b"] });
  });

  it("AppError → its code/status/Thai message/details; unexpected error → INTERNAL", async () => {
    const cookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId });
    const slot = withStaff("branch.get", {}, async () => {
      throw new AppError("VACCINE_REQUIRED", { missing: ["rabies"] });
    });
    const res = await slot(req("/api/v1/staff/branch", { cookie }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { details: unknown } }).error.details).toEqual({ missing: ["rabies"] });
    const boom = withStaff("branch.get", {}, async () => {
      throw new Error("db exploded");
    });
    await expectError(await boom(req("/api/v1/staff/branch", { cookie })), "INTERNAL");
  });

  it("setCookie → Set-Cookie header (HttpOnly, SameSite=Lax)", async () => {
    const h = withStaff("auth.staffLogout", {}, async (_ctx, _input, http) => {
      http.setCookie(sessionCookie("staff", "", new Date(0)));
      return undefined;
    });
    const res = await h(
      req("/api/v1/auth/staff/logout", {
        method: "POST",
        cookie: await login("staff", env.base.staff.owner, { organizationId: env.base.orgId }),
      }),
    );
    expect(res.headers.get("set-cookie")).toMatch(/^sid=; Path=\/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax/);
  });
});

describe("withCustomer", () => {
  const me = withCustomer("liff.me", {}, echo);
  const path = "/api/v1/liff/shop-a/me";
  const cust = () => login("customer", env.base.ownerProfileId, { organizationId: env.base.orgId, branchId: env.base.branchId });

  it("builds ctx for the registered customer of the path's branch", async () => {
    const res = await me(req(path, { cookie: await cust() }), ctxOf({ branchSlug: "shop-a" }));
    expect(res.status).toBe(200);
    const { ctx } = (await res.json()) as EchoBody;
    expect(ctx.actor).toEqual({ type: "customer", id: env.base.customerId });
    expect([ctx.orgId, ctx.branchId]).toEqual([env.base.orgId, env.base.branchId]);
  });

  it("session of another shop → UNAUTHENTICATED; unknown slug → NOT_FOUND; no cookie → UNAUTHENTICATED", async () => {
    await expectError(
      await me(req("/api/v1/liff/shop-b/me", { cookie: await cust() }), ctxOf({ branchSlug: "shop-b" })),
      "UNAUTHENTICATED",
    );
    await expectError(await me(req("/api/v1/liff/nope/me", { cookie: await cust() }), ctxOf({ branchSlug: "nope" })), "NOT_FOUND");
    await expectError(await me(req(path), ctxOf({ branchSlug: "shop-a" })), "UNAUTHENTICATED");
  });

  it("not registered yet → NOT_REGISTERED, except liff.register", async () => {
    const [p] = await env.db.insert(ownerProfile).values({ createdInOrgId: other.orgId, firstName: "New" }).returning();
    const cookie = await login("customer", p?.id ?? "", { organizationId: env.base.orgId, branchId: env.base.branchId });
    await expectError(await me(req(path, { cookie }), ctxOf({ branchSlug: "shop-a" })), "NOT_REGISTERED");
    const register = withCustomer("liff.register", {}, echo);
    const res = await register(req("/api/v1/liff/shop-a/register", { method: "POST", cookie }), ctxOf({ branchSlug: "shop-a" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as EchoBody).ctx.actor).toEqual({ type: "customer", id: null });
  });

  it("customer of a suspended organization → FORBIDDEN", async () => {
    const s = await seedOrg(env.db, "susp2");
    await env.db.update(organization).set({ status: "suspended" }).where(eq(organization.id, s.orgId));
    const cookie = await login("customer", s.ownerProfileId, { organizationId: s.orgId, branchId: s.branchId });
    await expectError(await me(req("/api/v1/liff/shop-susp2/me", { cookie }), ctxOf({ branchSlug: "shop-susp2" })), "FORBIDDEN");
  });
});

describe("withAdmin / withPublic", () => {
  it("admin: aid session → admin actor without org; staff cookie → UNAUTHENTICATED", async () => {
    const [a] = await env.db.insert(platformAdmin).values({ email: "root@pj8.test", passwordHash: "x", displayName: "Root" }).returning();
    const h = withAdmin("admin.orgs", {}, echo);
    const res = await h(req("/api/v1/admin/organizations", { cookie: await login("platform_admin", a?.id ?? "") }));
    expect(res.status).toBe(200);
    const { ctx } = (await res.json()) as EchoBody;
    expect([ctx.actor.type, ctx.orgId]).toEqual(["admin", null]);
    const staffCookie = await login("staff", env.base.staff.owner, { organizationId: env.base.orgId });
    await expectError(await h(req("/api/v1/admin/organizations", { cookie: staffCookie.replace("sid=", "aid=") })), "UNAUTHENTICATED");
  });

  it("public: no session needed, still CSRF-checked", async () => {
    const h = withPublic("public.branch", {}, echo);
    expect((await h(req("/api/v1/public/branches/shop-a"), ctxOf({ bookingSlug: "shop-a" }))).status).toBe(200);
    const login = withPublic("auth.staffLogin", {}, echo);
    await expectError(await login(req("/api/v1/auth/staff/login", { method: "POST", origin: null })), "FORBIDDEN");
  });

  it("webhook/cron paths skip the Origin check", async () => {
    const h = withPublic("cron.tick", {}, async () => undefined);
    expect((await h(req("/api/cron/tick", { method: "POST", origin: null }))).status).toBe(204);
  });
});
