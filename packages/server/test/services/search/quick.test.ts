import { SearchQuickRequest, SearchQuickResponse } from "@app/contracts/endpoints/search.quick";
import { booking, customer, daycareSessionType, daycareVisit, lineIdentity, ownerProfile, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { searchQuick } from "../../../src/services/search/quick.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("search.quick", { query: SearchQuickRequest }, searchQuick);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  // seeded customer "Owner a" becomes Somchai (นิด), phone +66812345678, with a LINE identity and two pets
  await env.db
    .update(ownerProfile)
    .set({ firstName: "Somchai", lastName: "Jaidee", nickname: "นิด", phoneE164: "+66812345678" })
    .where(eq(ownerProfile.id, org.ownerProfileId));
  await env.db
    .update(customer)
    .set({
      reliabilityLevel: 3,
      reliabilityOverride: 1,
      blacklisted: true,
      visitCount: 4,
      creditBalanceSatang: 15_000,
      lastVisitAt: new Date("2026-09-01T03:00:00.000Z"),
    })
    .where(eq(customer.id, org.customerId));
  await env.db.insert(lineIdentity).values({ providerId: "p1", lineUserId: "U1", ownerProfileId: org.ownerProfileId });
  const [mochi, kuma] = await env.db
    .insert(pet)
    .values([
      {
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name: "Mochi",
        species: "dog",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name: "Kuma",
        species: "cat",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ])
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.kuma = kuma?.id ?? "";

  // second customer with a 50% match ("somsri") and no LINE / pets
  const [op2] = await env.db
    .insert(ownerProfile)
    .values({ createdInOrgId: org.orgId, firstName: "Somsri", phoneE164: "+6621234567" })
    .returning();
  const [c2] = await env.db
    .insert(customer)
    .values({ organizationId: org.orgId, ownerProfileId: op2?.id ?? "" })
    .returning();
  ids.c2 = c2?.id ?? "";

  // other organization: same names, same phone, same booking number → never returned
  await env.db
    .update(ownerProfile)
    .set({ firstName: "Somchai", phoneE164: "+66812345678" })
    .where(eq(ownerProfile.id, foreign.ownerProfileId));
  await env.db.insert(pet).values({ ownerProfileId: foreign.ownerProfileId, createdInOrgId: foreign.orgId, name: "Mochi", species: "dog" });
  const newBooking = (o: SeedOrg, extra: Partial<typeof booking.$inferInsert> = {}) =>
    env.db
      .insert(booking)
      .values({
        organizationId: o.orgId,
        branchId: o.branchId,
        customerId: o.customerId,
        bookingNo: "B6910-0042",
        channel: "line_liff",
        createdByType: "staff",
        status: "awaiting_deposit",
        policySnapshot: {},
        ...extra,
      })
      .returning();
  const [b] = await newBooking(org, {
    estimatedTotalSatang: 90_000,
    depositRequiredSatang: 30_000,
    depositStatus: "pending",
    firstServiceAt: new Date("2026-10-10T02:00:00.000Z"),
    holdExpiresAt: new Date("2026-10-05T04:00:00.000Z"),
    createdAt: new Date("2026-10-05T02:00:00.000Z"),
  });
  ids.booking = b?.id ?? "";
  await newBooking(foreign);
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      session: "full_day",
      nameTh: "เต็มวัน",
      startsAt: "08:00",
      endsAt: "18:00",
      capacity: 10,
    })
    .returning();
  await env.db.insert(daycareVisit).values(
    [ids.mochi, ids.kuma, ids.mochi].map((petId, i) => ({
      organizationId: org.orgId,
      branchId: org.branchId,
      bookingId: ids.booking ?? "",
      petId: petId ?? "",
      sessionTypeId: session?.id ?? "",
      visitDate: `2026-10-1${i}`,
      priceSatang: 30_000,
      status: "reserved" as const,
    })),
  );
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
  return GET(new Request(`https://petbooking.test/api/v1/staff/search${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}
const search = (q: string) => searchQuick(staffCtx(env.base, "staff"), { q });
const customerIds = (r: SearchQuickResponse) => r.customers.map((c) => c.id);

it.each(["owner", "front_desk", "staff"] as const)("maps every CustomerListItem field for %s", async (role) => {
  const response = await get(`?q=${encodeURIComponent("chai")}`, role);
  expect(response.status).toBe(200);
  expect(SearchQuickResponse.parse(await response.json())).toEqual({
    customers: [
      {
        id: env.base.customerId,
        firstName: "Somchai",
        lastName: "Jaidee",
        nickname: "นิด",
        phone: "+66812345678",
        pets: [
          { id: ids.mochi, name: "Mochi", species: "dog" },
          { id: ids.kuma, name: "Kuma", species: "cat" },
        ],
        reliabilityLevel: 1,
        blacklisted: true,
        lastVisitAt: "2026-09-01T03:00:00.000Z",
        visitCount: 4,
        creditBalanceSatang: 15_000,
        lineLinked: true,
      },
    ],
    bookings: [],
  });
});

it("maps every BookingListItem field on an exact booking_no match", async () => {
  const response = await get("?q=B6910-0042");
  expect(response.status).toBe(200);
  expect(SearchQuickResponse.parse(await response.json())).toEqual({
    customers: [],
    bookings: [
      {
        id: ids.booking,
        bookingNo: "B6910-0042",
        status: "awaiting_deposit",
        channel: "line_liff",
        customerId: env.base.customerId,
        customerName: "Somchai (นิด)",
        firstServiceAt: "2026-10-10T02:00:00.000Z",
        modules: ["daycare"],
        petNames: ["Mochi", "Kuma"],
        estimatedTotalSatang: 90_000,
        depositStatus: "pending",
        depositRequiredSatang: 30_000,
        holdExpiresAt: "2026-10-05T04:00:00.000Z",
        approvalDueAt: null,
        createdAt: "2026-10-05T02:00:00.000Z",
      },
    ],
  });
  // booking_no is exact, not a substring match
  expect((await search("B6910")).bookings).toEqual([]);
  expect((await search("b6910-0042")).bookings).toEqual([]);
});

it("matches first name, last name and nickname case-insensitively, and pet names", async () => {
  expect(customerIds(await search("SOM"))).toEqual([env.base.customerId, ids.c2]);
  expect(customerIds(await search("jaidee"))).toEqual([env.base.customerId]);
  expect(customerIds(await search("นิด"))).toEqual([env.base.customerId]);
  expect(customerIds(await search("kum"))).toEqual([env.base.customerId]);
  expect(customerIds(await search("zz"))).toEqual([]);
  // LIKE wildcards in the term are literal
  expect(customerIds(await search("%%"))).toEqual([]);
  expect(customerIds(await search("__"))).toEqual([]);
});

it("normalizes phone terms with R-22 and matches the E.164 prefix", async () => {
  for (const q of ["081-234-5678", "+66 81 234 5678", "0812", "66812", "+6681"])
    expect(customerIds(await search(q)), q).toEqual([env.base.customerId]);
  expect(customerIds(await search("02-123-4567"))).toEqual([ids.c2]);
  expect(customerIds(await search("0899"))).toEqual([]);
});

it("limits customers to 20 results", async () => {
  const owners = await env.db
    .insert(ownerProfile)
    .values(Array.from({ length: 25 }, (_, i) => ({ createdInOrgId: env.base.orgId, firstName: `Limit${i}` })))
    .returning();
  await env.db.insert(customer).values(owners.map((o) => ({ organizationId: env.base.orgId, ownerProfileId: o.id })));
  expect((await search("limit")).customers).toHaveLength(20);
});

it("rejects a missing or too short q with VALIDATION_FAILED", async () => {
  for (const qs of ["", "?q=", "?q=a", "?q=%20a%20"]) {
    const response = await get(qs);
    expect(response.status, qs).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("never returns another organization's customers or bookings", async () => {
  const fromForeign = await searchQuick(staffCtx(foreign, "owner"), { q: "Somchai" });
  expect(customerIds(fromForeign)).toEqual([foreign.customerId]);
  const result = await search("Mochi");
  expect(customerIds(result)).toEqual([env.base.customerId]);
  expect((await search("B6910-0042")).bookings.map((b) => b.id)).toEqual([ids.booking]);
});

it("denies a customer actor", async () => {
  await expect(searchQuick(customerCtx(env.base), { q: "Somchai" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
