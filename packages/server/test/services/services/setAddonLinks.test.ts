import {
  ServicesSetAddonLinksParams,
  ServicesSetAddonLinksRequest,
  ServicesSetAddonLinksResponse,
} from "@app/contracts/endpoints/services.setAddonLinks";
import { service, serviceAddonLink } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { servicesSetAddonLinks } from "../../../src/services/services/setAddonLinks.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<"addon" | "bath" | "cut" | "otherAddon" | "hotelService" | "foreignBath", string> = {} as never;
async function addService(org: SeedOrg, nameTh: string, fields: Partial<typeof service.$inferInsert> = {}) {
  const [row] = await env.db
    .insert(service)
    .values({ organizationId: org.orgId, branchId: org.branchId, scope: "grooming", category: "bath", nameTh, ...fields })
    .returning();
  if (!row) throw new Error("service fixture");
  return row.id;
}
const links = async (addonId = ids.addon) =>
  (await env.db.select().from(serviceAddonLink).where(eq(serviceAddonLink.addonServiceId, addonId))).map((l) => l.baseServiceId).sort();
const set = (baseServiceIds: string[], org: SeedOrg = env.base, role: "owner" | "front_desk" | "staff" = "owner", serviceId = ids.addon) =>
  servicesSetAddonLinks(staffCtx(org, role), { serviceId, baseServiceIds });

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  ids.addon = await addService(env.base, "Nail trim", { isAddon: true });
  ids.bath = await addService(env.base, "Bath");
  ids.cut = await addService(env.base, "Cut");
  ids.otherAddon = await addService(env.base, "Teeth", { isAddon: true });
  ids.hotelService = await addService(env.base, "Boarding", { scope: "hotel", category: "hotel_addon" });
  ids.foreignBath = await addService(foreign, "Foreign bath");
});
afterAll(async () => {
  await env.close();
});

it("replaces the add-on's links, dedupes ids and returns the ServiceItem", async () => {
  const first = ServicesSetAddonLinksResponse.parse(await set([ids.bath, ids.cut, ids.bath]));
  expect(first).toMatchObject({ id: ids.addon, isAddon: true, nameTh: "Nail trim" });
  expect([...first.addonForServiceIds].sort()).toEqual([ids.bath, ids.cut].sort());
  expect(await links()).toEqual([ids.bath, ids.cut].sort());
  const [row] = await env.db.select().from(serviceAddonLink).where(eq(serviceAddonLink.baseServiceId, ids.cut));
  expect(row).toMatchObject({ organizationId: env.base.orgId, addonServiceId: ids.addon, createdAt: TEST_NOW });

  expect((await set([ids.cut])).addonForServiceIds).toEqual([ids.cut]);
  expect(await links()).toEqual([ids.cut]);
});
it("clears every link for [] (usable with all services of the same scope)", async () => {
  await set([ids.bath]);
  const result = await set([]);
  expect(result.addonForServiceIds).toEqual([]);
  expect(await links()).toEqual([]);
});
it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  await set([ids.bath]);
  await expect(set([ids.cut], env.base, role)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await links()).toEqual([ids.bath]);
});
it("returns NOT_FOUND for another organization's add-on or base service", async () => {
  await set([ids.bath]);
  await expect(set([ids.foreignBath], foreign)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(set([ids.bath, ids.foreignBath])).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(set([ids.bath], env.base, "owner", "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await links()).toEqual([ids.bath]);
});
it("rejects a non-add-on target and add-on or other-scope base services", async () => {
  await expect(set([ids.cut], env.base, "owner", ids.bath)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(set([ids.otherAddon])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(set([ids.hotelService])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await links(ids.bath)).toEqual([]);
});
it("returns HTTP 200 for a valid PUT and VALIDATION_FAILED for missing or malformed fields", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const PUT = withStaff(
    "services.setAddonLinks",
    { params: ServicesSetAddonLinksParams, body: ServicesSetAddonLinksRequest },
    servicesSetAddonLinks,
  );
  const put = (id: string, body: unknown) =>
    PUT(
      new Request(`https://petbooking.test/api/v1/staff/services/${id}/addon-links`, {
        method: "PUT",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
      { params: { serviceId: id } },
    );
  const ok = await put(ids.addon, { baseServiceIds: [ids.bath] });
  expect(ok.status).toBe(200);
  expect(ServicesSetAddonLinksResponse.parse(await ok.json()).addonForServiceIds).toEqual([ids.bath]);
  for (const [id, body] of [
    [ids.addon, {}],
    [ids.addon, { baseServiceIds: ["bad"] }],
    [ids.addon, { baseServiceIds: ids.bath }],
    ["bad", { baseServiceIds: [] }],
  ] as const) {
    const response = await put(id, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
