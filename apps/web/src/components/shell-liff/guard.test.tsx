import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../../../packages/server/src/auth/session";
import { resetRateLimits } from "../../../../../packages/server/src/http/rate-limit";
import { resetPublicBranchCache } from "../../../../../packages/server/src/services/public/branch";
import { seedOrg, setupTestDb, type TestEnv } from "../../../../../packages/server/test/helpers/setup";
import LiffBranchLayout from "../../../app/(liff)/liff/[branchSlug]/layout";

// Keep the real pipelines and PGlite helper in the same checkout even when node_modules is symlinked.
vi.mock("@app/server/http", async () => {
  const wrap = await import("../../../../../packages/server/src/http/wrap");
  return { withCustomer: wrap.withCustomer, withPublic: wrap.withPublic };
});
vi.mock("@app/server/services/liff/me", async () => ({
  liffMe: (await import("../../../../../packages/server/src/services/liff/me")).liffMe,
}));
vi.mock("@app/server/services/public/branch", async () => await import("../../../../../packages/server/src/services/public/branch"));
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./liff-shell", () => ({
  LiffShell: (props: { state: string; fake: boolean; shop: { name: string }; children: React.ReactNode }) => (
    <div data-state={props.state} data-fake={String(props.fake)} data-shop={props.shop.name}>
      {props.children}
    </div>
  ),
  LiffForbidden: () => <p>forbidden-view</p>,
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
beforeEach(() => {
  resetRateLimits();
  resetPublicBranchCache();
});
const child = <p>protected</p>;
const render = async (slug: string) =>
  renderToStaticMarkup(await LiffBranchLayout({ params: Promise.resolve({ branchSlug: slug }), children: child }));
const cid = async (s: { ownerProfileId: string; orgId: string; branchId: string }) =>
  (
    await createSession(
      env.db,
      { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
      new Date(),
    )
  ).token;

it("a registered customer of this branch → ready shell with the shop name", async () => {
  request.cookie = `cid=${await cid(env.base)}`;
  const html = await render("shop-a");
  expect(html).toContain('data-state="ready"');
  expect(html).toContain('data-shop="Shop a"');
  expect(html).toContain("protected");
});

it("no cid or another branch's cid → signin; LINE known but not a customer → register", async () => {
  const other = await seedOrg(env.db, "lg1");
  for (const cookie of ["", "cid=unknown", `cid=${await cid(other)}`]) {
    request.cookie = cookie;
    expect(await render("shop-a")).toContain('data-state="signin"');
  }
  await env.t.pg.query("delete from customer where id = $1", [other.customerId]);
  request.cookie = `cid=${await cid(other)}`;
  expect(await render("shop-lg1")).toContain('data-state="register"');
});

it("unknown shop or a suspended shop (hidden by public.branch, Q-1033) → 404", async () => {
  await expect(render("no-such-shop")).rejects.toThrow("NEXT_NOT_FOUND");
  const s = await seedOrg(env.db, "lg2");
  request.cookie = `cid=${await cid(s)}`;
  await env.t.pg.query("update organization set status = 'suspended' where id = $1", [s.orgId]);
  await expect(render("shop-lg2")).rejects.toThrow("NEXT_NOT_FOUND");
});

it("passes LINE_FAKE to the client sign-in", async () => {
  vi.stubEnv("LINE_FAKE", "1");
  request.cookie = "";
  expect(await render("shop-a")).toContain('data-fake="true"');
  vi.stubEnv("LINE_FAKE", "");
});
