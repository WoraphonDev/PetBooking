import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { organization, platformAdmin, supportAccessLog } from "../../../../../packages/db/src/schema/index";
import { createSession } from "../../../../../packages/server/src/auth/session";
import { setupTestDb, type TestEnv } from "../../../../../packages/server/test/helpers/setup";
import ConsoleLayout from "../../../app/(console)/console/layout";

// Keep the real pipeline and PGlite helper in the same checkout even when node_modules is symlinked.
vi.mock("@app/server/http", async () => ({ withStaff: (await import("../../../../../packages/server/src/http/wrap")).withStaff }));
vi.mock("@app/server/services/auth/me", async () => ({
  authMe: (await import("../../../../../packages/server/src/services/auth/me")).authMe,
}));
const request = vi.hoisted(() => ({ cookie: "", redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    request.redirect(url);
    throw new Error("redirect");
  },
}));
vi.mock("./console-shell", () => ({
  ConsoleShell: (props: { role: string; supportMode: boolean; shopName: string; children: React.ReactNode }) => (
    <div data-role={props.role} data-support={String(props.supportMode)} data-shop={props.shopName}>
      {props.children}
    </div>
  ),
  ConsoleForbidden: () => <p>forbidden-view</p>,
}));

let env: TestEnv;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  env = await setupTestDb();
}, 60_000);
afterAll(async () => {
  await env?.close();
  vi.unstubAllEnvs();
});
const child = <p>protected</p>;
const session = (role: "owner" | "front_desk" | "staff", at = new Date()) =>
  createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    at,
  );

it("passes the staff role and branch name to the shell for a valid sid", async () => {
  for (const role of ["owner", "front_desk", "staff"] as const) {
    request.cookie = `sid=${(await session(role)).token}`;
    const html = renderToStaticMarkup(await ConsoleLayout({ children: child }));
    expect(html).toContain(`data-role="${role}"`);
    expect(html).toContain('data-support="false"');
    expect(html).toContain('data-shop="Shop a"');
    expect(html).toContain("protected");
  }
  expect(request.redirect).not.toHaveBeenCalled();
});

it("redirects to /login without a usable staff session", async () => {
  const expired = await session("owner", new Date(Date.now() - 40 * 86_400_000));
  for (const cookie of ["", "sid=unknown", `sid=${expired.token}`]) {
    request.cookie = cookie;
    await expect(ConsoleLayout({ children: child })).rejects.toThrow("redirect");
    expect(request.redirect).toHaveBeenLastCalledWith("/login");
  }
});

it("flags support mode for a platform admin support session", async () => {
  const adminId = randomUUID();
  await env.db
    .insert(platformAdmin)
    .values({ id: adminId, email: "a@test.example", displayName: "A", passwordHash: "x", status: "active" });
  const [log] = await env.db
    .insert(supportAccessLog)
    .values({ organizationId: env.base.orgId, platformAdminId: adminId, reason: "ช่วยตั้งค่า", startedAt: new Date() })
    .returning();
  const s = await createSession(
    env.db,
    { subjectType: "platform_admin", subjectId: adminId, organizationId: env.base.orgId, supportAccessLogId: log?.id },
    new Date(),
  );
  request.cookie = `sid=${s.token}`;
  const html = renderToStaticMarkup(await ConsoleLayout({ children: child }));
  expect(html).toContain('data-support="true"');
});

it("shows the 403 view for a suspended organization", async () => {
  request.cookie = `sid=${(await session("owner")).token}`;
  await env.db.update(organization).set({ status: "suspended" });
  const html = renderToStaticMarkup(await ConsoleLayout({ children: child }));
  expect(html).toContain("forbidden-view");
  expect(html).not.toContain("protected");
});
