import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { platformAdmin } from "../../../../../packages/db/src/schema/index";
import { createSession } from "../../../../../packages/server/src/auth/session";
import { setupTestDb, type TestEnv } from "../../../../../packages/server/test/helpers/setup";
import { ProtectedAdminShell } from "./guard";

// Keep the real resolver and PGlite helper in the same checkout even when node_modules is symlinked.
vi.mock("@app/server/http", async () => ({
  resolveAdmin: (await import("../../../../../packages/server/src/http/auth")).resolveAdmin,
}));

const request = vi.hoisted(() => ({ cookie: "", redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    request.redirect(url);
    throw new Error("redirect");
  },
}));
vi.mock("./admin-shell", () => ({ AdminShell: () => null }));
let env: TestEnv;
const adminId = randomUUID();
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  env = await setupTestDb();
  await env.db
    .insert(platformAdmin)
    .values({ id: adminId, email: "admin@test.example", displayName: "Admin", passwordHash: "unused-in-session-test", status: "active" });
}, 60_000);
afterAll(async () => {
  await env?.close();
  vi.unstubAllEnvs();
});

it("uses real hashed sessions: accepts active admins; rejects absent, unknown, expired, staff and disabled sessions", async () => {
  const now = new Date();
  const valid = await createSession(env.db, { subjectType: "platform_admin", subjectId: adminId }, now);
  request.cookie = `aid=${valid.token}`;
  const child = <p>protected</p>;
  expect((await ProtectedAdminShell({ children: child })).props.children).toBe(child);
  expect(request.redirect).not.toHaveBeenCalled();

  const expired = await createSession(
    env.db,
    { subjectType: "platform_admin", subjectId: adminId },
    new Date(now.getTime() - 13 * 3_600_000),
  );
  const staff = await createSession(env.db, { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId }, now);
  for (const cookie of ["", "aid=unknown", `aid=${expired.token}`, `aid=${staff.token}`]) {
    request.cookie = cookie;
    await expect(ProtectedAdminShell({ children: child })).rejects.toThrow("redirect");
    expect(request.redirect).toHaveBeenLastCalledWith("/admin/login");
  }
  await env.db.update(platformAdmin).set({ status: "disabled" });
  request.cookie = `aid=${valid.token}`;
  await expect(ProtectedAdminShell({ children: child })).rejects.toThrow("redirect");
  expect(request.redirect).toHaveBeenCalledTimes(5);
});
