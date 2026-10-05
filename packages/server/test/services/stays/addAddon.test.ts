import { StaysAddAddonParams, StaysAddAddonRequest, StaysAddAddonResponse } from "@app/contracts/endpoints/stays.addAddon";
import { bill, billLine, booking, pet, ratePlan, roomType, roomUnit, service, servicePrice, stay, stayAddon } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysAddAddon } from "../../../src/services/stays/addAddon.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.addAddon", { body: StaysAddAddonRequest, params: StaysAddAddonParams }, staysAddAddon);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const ids = { smallType: "", bigType: "", walk: "", bath: "", groomAddon: "", archived: "" };
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "Standard" })
    .returning();
  const types = await env.db
    .insert(roomType)
    .values([
      { ...tenant, nameTh: "ห้องเล็ก" },
      { ...tenant, nameTh: "ห้องใหญ่" },
    ])
    .returning();
  ids.smallType = types[0]?.id ?? "";
  ids.bigType = types[1]?.id ?? "";
  const services = await env.db
    .insert(service)
    .values([
      { ...tenant, nameTh: "พาเดินเล่น", category: "hotel_addon", scope: "hotel", isAddon: true, addonPerDay: true },
      { ...tenant, nameTh: "อาบน้ำก่อนกลับ", category: "hotel_addon", scope: "hotel", isAddon: true },
      { ...tenant, nameTh: "โบว์", category: "other", scope: "grooming", isAddon: true },
      { ...tenant, nameTh: "เลิกขาย", category: "hotel_addon", scope: "hotel", isAddon: true, status: "archived" },
    ])
    .returning();
  [ids.walk, ids.bath, ids.groomAddon, ids.archived] = services.map((s) => s.id) as [string, string, string, string];
  await env.db.insert(servicePrice).values(
    [ids.walk, ids.bath].map((serviceId, i) => ({
      organizationId: env.base.orgId,
      serviceId,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any" as const,
      priceSatang: i === 0 ? 10_000 : 25_000,
      durationMinutes: 0,
    })),
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function seedUnit(typeId: string, org: SeedOrg = env.base, status: "active" | "archived" = "active") {
  const [u] = await env.db
    .insert(roomUnit)
    .values({ organizationId: org.orgId, branchId: org.branchId, roomTypeId: typeId, code: `R${++seq}`, status })
    .returning();
  return u?.id ?? "";
}
/** a confirmed 2-night stay (600/night) in its own room; optional bill on the booking */
async function seedStay(
  opts: { status?: typeof stay.$inferInsert.status; bill?: "open" | "paid"; checkIn?: string; checkOut?: string; unitId?: string } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  let typeId = ids.smallType;
  if (org !== env.base) {
    const [t] = await env.db
      .insert(roomType)
      .values({ ...tenant, nameTh: "อื่น" })
      .returning();
    typeId = t?.id ?? "";
  }
  const [b] = opts.bill
    ? await env.db
        .insert(bill)
        .values({
          ...tenant,
          customerId: org.customerId,
          openedBy: org.staff.owner,
          status: opts.bill,
          subtotalSatang: 120_000,
          totalSatang: 120_000,
          paidSatang: opts.bill === "paid" ? 120_000 : 0,
        })
        .returning()
    : [];
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      estimatedTotalSatang: 120_000,
      billId: b?.id ?? null,
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const unitId = opts.unitId ?? (await seedUnit(typeId, org));
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: typeId,
      roomUnitId: unitId,
      checkInDate: opts.checkIn ?? "2026-10-10",
      checkOutDate: opts.checkOut ?? "2026-10-12",
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
      status: opts.status ?? "reserved",
    })
    .returning();
  if (b)
    await env.db.insert(billLine).values({
      organizationId: org.orgId,
      billId: b.id,
      refType: "stay",
      refId: s?.id ?? "",
      petId: p?.id ?? "",
      lineType: "stay_night",
      description: "ห้องเล็ก",
      quantity: 2,
      unitPriceSatang: 60_000,
      lineTotalSatang: 120_000,
    });
  return { id: s?.id ?? "", bookingId: bk?.id ?? "", billId: b?.id ?? "", unitId };
}
async function call(
  method: string,
  url: string,
  params: Record<string, string>,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const estimateOf = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0]?.estimatedTotalSatang;
const billOf = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];
const add = (stayId: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call("POST", `/api/v1/staff/stays/${stayId}/addons`, { stayId }, body, role);

it("a one-off add-on uses the requested quantity; a per-day one takes the nights; the estimate grows", async () => {
  const s = await seedStay();
  const res = await add(s.id, { serviceId: ids.bath, quantity: 2 });
  expect(res.status).toBe(200);
  StaysAddAddonResponse.parse(await res.json());
  const detail = StaysAddAddonResponse.parse(await (await add(s.id, { serviceId: ids.walk, quantity: 5 })).json());
  expect(detail.addons.map((a) => [a.name, a.quantity, a.totalSatang])).toEqual([
    ["อาบน้ำก่อนกลับ", 2, 50_000],
    ["พาเดินเล่น", 2, 20_000],
  ]);
  const rows = await env.db.select().from(stayAddon).where(eq(stayAddon.stayId, s.id));
  expect(rows.find((r) => r.serviceId === ids.bath)).toMatchObject({
    unitPriceSatang: 25_000,
    quantity: 2,
    totalSatang: 50_000,
    addedByType: "staff",
  });
  expect(await estimateOf(s.bookingId)).toBe(120_000 + 70_000);
});

it("an open bill carrying the stay gets the add-on line and new totals; a paid bill → BILL_NOT_OPEN", async () => {
  const s = await seedStay({ status: "checked_in", bill: "open" });
  await add(s.id, { serviceId: ids.bath });
  const lines = await env.db.select().from(billLine).where(eq(billLine.billId, s.billId));
  expect(lines.find((l) => l.lineType === "stay_addon")).toMatchObject({
    description: "อาบน้ำก่อนกลับ",
    quantity: 1,
    lineTotalSatang: 25_000,
  });
  expect(await billOf(s.billId)).toMatchObject({ subtotalSatang: 145_000, totalSatang: 145_000 });
  const paid = await seedStay({ status: "checked_in", bill: "paid" });
  expect(await codeOf(await add(paid.id, { serviceId: ids.bath }))).toBe("BILL_NOT_OPEN");
  expect(await env.db.select().from(stayAddon).where(eq(stayAddon.stayId, paid.id))).toEqual([]);
});

it("not an active hotel add-on → VALIDATION_FAILED; finished stay → STATUS_NOT_ALLOWED", async () => {
  const s = await seedStay();
  for (const serviceId of [ids.groomAddon, ids.archived]) expect(await codeOf(await add(s.id, { serviceId }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await add((await seedStay({ status: "checked_out" })).id, { serviceId: ids.bath }))).toBe("STATUS_NOT_ALLOWED");
});

it("bad body → VALIDATION_FAILED; role staff → FORBIDDEN; another org's stay → NOT_FOUND", async () => {
  const s = await seedStay();
  expect(await codeOf(await add(s.id, { serviceId: ids.bath, quantity: 0 }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await add(s.id, {}))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await add(s.id, { serviceId: ids.bath }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await add((await seedStay({}, other)).id, { serviceId: ids.bath }))).toBe("NOT_FOUND");
});
