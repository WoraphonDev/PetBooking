import { CustomersListRequest, CustomersListResponse } from "@app/contracts/endpoints/customers.list";
import { customer, lineIdentity, ownerProfile, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { customersList } from "../../../src/services/customers/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("customers.list", { query: CustomersListRequest }, customersList);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

async function addCustomer(org: SeedOrg, firstName: string, extra: Partial<typeof customer.$inferInsert> = {}, phoneE164?: string) {
  const [o] = await env.db.insert(ownerProfile).values({ createdInOrgId: org.orgId, firstName, phoneE164 }).returning();
  const [c] = await env.db
    .insert(customer)
    .values({ organizationId: org.orgId, ownerProfileId: o?.id ?? "", ...extra })
    .returning();
  return { customerId: c?.id ?? "", ownerProfileId: o?.id ?? "" };
}

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  // seeded "Owner a" → Somchai, the richest row
  await env.db
    .update(ownerProfile)
    .set({ firstName: "Somchai", lastName: "Jaidee", nickname: "นิด", phoneE164: "+66812345678" })
    .where(eq(ownerProfile.id, env.base.ownerProfileId));
  await env.db
    .update(customer)
    .set({
      reliabilityOverride: 1,
      blacklisted: true,
      visitCount: 4,
      creditBalanceSatang: 15_000,
      lastVisitAt: new Date("2026-09-01T03:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    .where(eq(customer.id, env.base.customerId));
  await env.db.insert(lineIdentity).values({ providerId: "p1", lineUserId: "U1", ownerProfileId: env.base.ownerProfileId });
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Mochi", species: "dog" })
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.somchai = env.base.customerId;
  ids.anan = (
    await addCustomer(env.base, "Anan", {
      lastVisitAt: new Date("2026-09-20T03:00:00.000Z"),
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    })
  ).customerId;
  ids.wipa = (await addCustomer(env.base, "Wipa", { createdAt: new Date("2026-03-01T00:00:00.000Z") }, "+6621234567")).customerId;
  ids.boon = (await addCustomer(env.base, "Boon", { createdAt: new Date("2026-04-01T00:00:00.000Z") })).customerId;
  await addCustomer(foreign, "Somchai", {}, "+66812345678");
});
afterAll(async () => {
  await env.close();
});

async function get(qs: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/customers${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}
const list = (input: Partial<CustomersListRequest> = {}) => customersList(staffCtx(env.base, "owner"), CustomersListRequest.parse(input));
const idsOf = (r: CustomersListResponse) => r.items.map((c) => c.id);
async function allPages(sort: CustomersListRequest["sort"], limit: number) {
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ sort, limit, cursor });
    seen.push(...idsOf(page));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return seen;
}

it.each(["owner", "front_desk"] as const)("maps every CustomerListItem field for %s", async (role) => {
  const response = await get("?q=chai", role);
  expect(response.status).toBe(200);
  expect(CustomersListResponse.parse(await response.json())).toEqual({
    nextCursor: null,
    items: [
      {
        id: ids.somchai,
        firstName: "Somchai",
        lastName: "Jaidee",
        nickname: "นิด",
        phone: "+66812345678",
        pets: [{ id: ids.mochi, name: "Mochi", species: "dog" }],
        reliabilityLevel: 1,
        blacklisted: true,
        lastVisitAt: "2026-09-01T03:00:00.000Z",
        visitCount: 4,
        creditBalanceSatang: 15_000,
        lineLinked: true,
      },
    ],
  });
});

it("sorts by last visit (default, never-visited last), name and newest, and pages with the cursor", async () => {
  // never-visited customers come last, tie-broken by id (desc)
  const neverVisited = [ids.boon, ids.wipa].sort().reverse();
  expect(idsOf(await list())).toEqual([ids.anan, ids.somchai, ...neverVisited]);
  expect(idsOf(await list({ sort: "name_asc" }))).toEqual([ids.anan, ids.boon, ids.somchai, ids.wipa]);
  expect(idsOf(await list({ sort: "created_desc" }))).toEqual([ids.boon, ids.wipa, ids.anan, ids.somchai]);
  for (const sort of ["last_visit_desc", "name_asc", "created_desc"] as const)
    for (const limit of [1, 2, 3]) expect(await allPages(sort, limit), `${sort}/${limit}`).toEqual(idsOf(await list({ sort })));
  const first = await list({ limit: 2 });
  expect(first.nextCursor).toEqual(expect.any(String));
  expect((await list({ limit: 4 })).nextCursor).toBeNull();
});

it("filters with q on names, pet names and phone prefix", async () => {
  expect(idsOf(await list({ q: "mochi" }))).toEqual([ids.somchai]);
  expect(idsOf(await list({ q: "0812" }))).toEqual([ids.somchai]);
  expect(idsOf(await list({ q: "02-123" }))).toEqual([ids.wipa]);
  expect(idsOf(await list({ q: "zzz" }))).toEqual([]);
  expect(idsOf(await list({ q: "  " }))).toHaveLength(4);
});

it("rejects malformed query values with VALIDATION_FAILED", async () => {
  for (const qs of ["?sort=oldest", "?limit=0", "?limit=201", "?limit=x", "?cursor=bad"]) {
    const response = await get(qs);
    expect(response.status, qs).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies role staff and customer actors", async () => {
  const response = await get("", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(customersList(customerCtx(env.base), CustomersListRequest.parse({}))).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("never lists another organization's customers", async () => {
  expect(idsOf(await list({ q: "Somchai" }))).toEqual([ids.somchai]);
  const fromForeign = await customersList(staffCtx(foreign, "owner"), CustomersListRequest.parse({}));
  expect(idsOf(fromForeign)).not.toContain(ids.somchai);
  expect(idsOf(fromForeign)).toHaveLength(2);
});
