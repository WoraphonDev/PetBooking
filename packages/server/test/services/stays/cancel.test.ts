import { StaysCancelParams, StaysCancelRequest, StaysCancelResponse } from "@app/contracts/endpoints/stays.cancel";
import { booking, bookingEvent, pet, roomType, roomUnit, scheduledJob, service, stay, stayAddon } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysCancel } from "../../../src/services/stays/cancel.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.cancel", { body: StaysCancelRequest, params: StaysCancelParams }, staysCancel);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const roomTypes = new Map<string, string>();
const addonService = new Map<string, string>();
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) {
    const [t] = await env.db.insert(roomType).values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "ห้องเล็ก" }).returning();
    roomTypes.set(org.orgId, t?.id ?? "");
    const [s] = await env.db
      .insert(service)
      .values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "พาเดินเล่น", category: "bath", scope: "hotel", isAddon: true })
      .returning();
    addonService.set(org.orgId, s?.id ?? "");
  }
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a confirmed booking with `stays` reserved stays (2 nights × 600 บาท each + a 100 บาท add-on on the first) */
async function seedBooking(stays = 2, status: typeof stay.$inferInsert.status = "reserved", org: SeedOrg = env.base) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
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
      estimatedTotalSatang: stays * 120_000 + 10_000,
    })
    .returning();
  const ids: string[] = [];
  for (let i = 0; i < stays; i++) {
    const [p] = await env.db
      .insert(pet)
      .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
      .returning();
    // own room per stay: stay_room_no_overlap
    const [unit] = await env.db
      .insert(roomUnit)
      .values({ ...tenant, roomTypeId: roomTypes.get(org.orgId) ?? "", code: `R${seq}` })
      .returning();
    const [s] = await env.db
      .insert(stay)
      .values({
        ...tenant,
        bookingId: bk?.id ?? "",
        petId: p?.id ?? "",
        roomTypeId: roomTypes.get(org.orgId) ?? "",
        roomUnitId: unit?.id ?? "",
        checkInDate: "2026-11-01",
        checkOutDate: "2026-11-03",
        nights: 2,
        nightlyPriceSatang: 60_000,
        roomTotalSatang: 120_000,
        status: i === 0 ? status : "reserved",
      })
      .returning();
    ids.push(s?.id ?? "");
  }
  await env.db.insert(stayAddon).values({
    organizationId: org.orgId,
    stayId: ids[0] ?? "",
    serviceId: addonService.get(org.orgId) ?? "",
    nameSnapshot: "พาเดินเล่น",
    unitPriceSatang: 10_000,
    totalSatang: 10_000,
    addedByType: "staff",
  });
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "reminder_24h",
    runAt: new Date(Date.UTC(2026, 9, 31, 3)),
    payload: { bookingId: bk?.id, entityType: "stay", entityId: ids[0] },
    dedupeKey: `reminder_24h:${ids[0]}:x`,
  });
  return { bookingId: bk?.id ?? "", stayIds: ids };
}
async function cancel(id: string, body: unknown = { reason: "ลูกค้าไม่ฝากตัวนี้แล้ว" }, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/cancel`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const stayRow = async (id: string) => (await env.db.select().from(stay).where(eq(stay.id, id)))[0];

it("cancels one stay of a two-pet booking: event with reason, reminder cancelled, estimate lowered", async () => {
  const b = await seedBooking();
  const [first = "", second = ""] = b.stayIds;
  const res = await cancel(first);
  expect(res.status).toBe(200);
  const detail = StaysCancelResponse.parse(await res.json());
  expect(detail).toMatchObject({ id: b.bookingId, status: "confirmed", estimatedTotalSatang: 120_000 });
  expect(detail.stays.find((s) => s.id === first)?.status).toBe("cancelled");
  expect((await stayRow(second))?.status).toBe("reserved");
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, first));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.reason])).toEqual([
    ["stay", "reserved", "cancelled", "ลูกค้าไม่ฝากตัวนี้แล้ว"],
  ]);
  const [job] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `reminder_24h:${first}:x`));
  expect(job?.status).toBe("cancelled");
});

it("the last active item → STATUS_NOT_ALLOWED with a bookings.cancel hint", async () => {
  const b = await seedBooking(1);
  const res = await cancel(b.stayIds[0] ?? "");
  expect(((await res.json()) as { error: { code: string; details: unknown } }).error).toMatchObject({
    code: "STATUS_NOT_ALLOWED",
    details: { hint: "bookings.cancel" },
  });
});

it.each(["checked_in", "checked_out", "cancelled"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await cancel((await seedBooking(2, status)).stayIds[0] ?? ""))).toBe("INVALID_TRANSITION");
});

it("missing reason → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const b = await seedBooking();
  expect(await codeOf(await cancel(b.stayIds[0] ?? "", {}))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await cancel(b.stayIds[0] ?? "", undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await cancel((await seedBooking(2, "reserved", other)).stayIds[0] ?? ""))).toBe("NOT_FOUND");
});
