import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { requireRole } from "../../src/auth/permissions.ts";
import type { RequestContext } from "../../src/context.ts";
import { auditList } from "../../src/services/audit/list.ts";
import { setupTestDb, staffCtx, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());

// Q-0007 / Q-0033: a support session is an admin actor acting as owner, with a support_access_log id
const support = (extra: Partial<RequestContext> = {}): RequestContext => ({
  ...staffCtx(env.base, "owner"),
  actor: { type: "admin", id: randomUUID(), role: "owner" },
  supportAccessLogId: randomUUID(),
  ...extra,
});

it("lets a support session read owner endpoints through the service's own requireRole", async () => {
  expect(() => requireRole(support(), "audit.list")).not.toThrow();
  expect(() => requireRole(support(), "customers.get")).not.toThrow();
  expect(await auditList(support(), { limit: 50 })).toEqual({ items: [], nextCursor: null });
});

it("refuses an admin actor without a support session", () => {
  expect(() => requireRole(support({ supportAccessLogId: null }), "audit.list")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
});

it("refuses endpoints the support role is not allowed on, and other actor types", () => {
  const asFrontDesk = support({ actor: { type: "admin", id: randomUUID(), role: "front_desk" } });
  expect(() => requireRole(asFrontDesk, "audit.list")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  expect(() => requireRole(support({ actor: { type: "admin", id: randomUUID() } }), "audit.list")).toThrow(
    expect.objectContaining({ code: "FORBIDDEN" }),
  );
  expect(() => requireRole({ ...support(), actor: { type: "customer", id: randomUUID(), role: "owner" } }, "audit.list")).toThrow(
    expect.objectContaining({ code: "FORBIDDEN" }),
  );
  expect(() => requireRole(staffCtx(env.base, "staff"), "audit.list")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  expect(() => requireRole(staffCtx(env.base, "owner"), "audit.list")).not.toThrow();
});
