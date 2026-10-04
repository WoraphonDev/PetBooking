import { StaysChangeRoomParams, StaysChangeRoomRequest, StaysChangeRoomResponse } from "@app/contracts/endpoints/stays.changeRoom";
import { bill, billLine, booking, pet, ratePlan, roomType, roomUnit, service, servicePrice, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysChangeRoom } from "../../../src/services/stays/changeRoom.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.changeRoom", { body: StaysChangeRoomRequest, params: StaysChangeRoomParams }, staysChangeRoom);
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
const _estimateOf = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0]?.estimatedTotalSatang;
const _billOf = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];
const move = (stayId: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call("PATCH", `/api/v1/staff/stays/${stayId}/room`, { stayId }, body, role);

it("moves a reserved or checked-in stay to a free room of the same type, price unchanged", async () => {
  for (const status of ["reserved", "checked_in"] as const) {
    const s = await seedStay({ status });
    const target = await seedUnit(ids.smallType);
    const res = await move(s.id, { roomUnitId: target });
    expect(res.status).toBe(200);
    const card = StaysChangeRoomResponse.parse(await res.json());
    expect(card).toMatchObject({ id: s.id, roomUnitId: target, roomTotalSatang: 120_000 });
    expect((await env.db.select().from(stay).where(eq(stay.id, s.id)))[0]).toMatchObject({
      roomUnitId: target,
      nightlyPriceSatang: 60_000,
    });
  }
});

it("a room taken on those nights → ROOM_TAKEN", async () => {
  const busy = await seedStay({ checkIn: "2026-10-11", checkOut: "2026-10-13" });
  const s = await seedStay();
  expect(await codeOf(await move(s.id, { roomUnitId: busy.unitId }))).toBe("ROOM_TAKEN");
  expect((await env.db.select().from(stay).where(eq(stay.id, s.id)))[0]?.roomUnitId).toBe(s.unitId);
});

it("another room type (Q-0110) or an archived room → VALIDATION_FAILED; a finished stay → STATUS_NOT_ALLOWED", async () => {
  const s = await seedStay();
  expect(await codeOf(await move(s.id, { roomUnitId: await seedUnit(ids.bigType) }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await move(s.id, { roomUnitId: await seedUnit(ids.smallType, env.base, "archived") }))).toBe("VALIDATION_FAILED");
  for (const status of ["checked_out", "cancelled", "no_show"] as const)
    expect(await codeOf(await move((await seedStay({ status })).id, { roomUnitId: await seedUnit(ids.smallType) }))).toBe(
      "STATUS_NOT_ALLOWED",
    );
});

it("bad body → VALIDATION_FAILED; role staff → FORBIDDEN; another org's stay or room → NOT_FOUND", async () => {
  const s = await seedStay();
  expect(await codeOf(await move(s.id, { roomUnitId: "x" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await move(s.id, { roomUnitId: await seedUnit(ids.smallType) }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await move((await seedStay({}, other)).id, { roomUnitId: await seedUnit(ids.smallType) }))).toBe("NOT_FOUND");
  const foreign = await seedStay({}, other);
  expect(await codeOf(await move(s.id, { roomUnitId: foreign.unitId }))).toBe("NOT_FOUND");
});
