import { StaysNoShowParams, StaysNoShowResponse } from "@app/contracts/endpoints/stays.noShow";
import { auditLog, booking, bookingEvent, customer, notification, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysNoShow } from "../../../src/services/stays/noShow.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.noShow", { params: StaysNoShowParams }, staysNoShow);
const DAY = 86_400_000;
/** branch local date `days` from the real clock (the route uses it as ctx.now) */
const localDay = (days: number) => toLocalDate({ instant: new Date(Date.now() + days * DAY).toISOString(), timezone: "Asia/Bangkok" });
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const roomTypes = new Map<string, string>();
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) {
    const [t] = await env.db.insert(roomType).values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "ห้องเล็ก" }).returning();
    roomTypes.set(org.orgId, t?.id ?? "");
  }
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db.update(customer).set({ noShowCount12m: 0, reliabilityLevel: 3 }).where(eq(customer.id, env.base.customerId));
});

/** a confirmed booking with `stays` stays checking in on `checkIn`; the first one has `status` */
async function seedBooking(
  opts: { stays?: number; status?: typeof stay.$inferInsert.status; checkIn?: string; deposit?: number } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const deposit = opts.deposit ?? 0;
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      depositRequiredSatang: deposit,
      depositVerifiedSatang: deposit,
      depositStatus: deposit > 0 ? "verified" : "not_required",
      policySnapshot: {},
      firstServiceAt: new Date(),
    })
    .returning();
  const ids: string[] = [];
  for (let i = 0; i < (opts.stays ?? 1); i++) {
    const [p] = await env.db
      .insert(pet)
      .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
      .returning();
    // own room per stay: stay_room_no_overlap
    const [unit] = await env.db
      .insert(roomUnit)
      .values({ ...tenant, roomTypeId: roomTypes.get(org.orgId) ?? "", code: `R${seq}` })
      .returning();
    const checkIn = opts.checkIn ?? localDay(0);
    const [s] = await env.db
      .insert(stay)
      .values({
        ...tenant,
        bookingId: bk?.id ?? "",
        petId: p?.id ?? "",
        roomTypeId: roomTypes.get(org.orgId) ?? "",
        roomUnitId: unit?.id ?? "",
        checkInDate: checkIn,
        checkOutDate: toLocalDate({ instant: new Date(Date.parse(`${checkIn}T12:00:00Z`) + 2 * DAY).toISOString(), timezone: "UTC" }),
        nights: 2,
        nightlyPriceSatang: 60_000,
        roomTotalSatang: 120_000,
        status: i === 0 ? (opts.status ?? "reserved") : "reserved",
      })
      .returning();
    ids.push(s?.id ?? "");
  }
  return { bookingId: bk?.id ?? "", stayIds: ids };
}
async function noShow(id: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/no-show`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { stayId: id } },
  );
}
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; details?: unknown } }).error;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const noteOf = async (stayId: string) =>
  (
    await env.db
      .select()
      .from(notification)
      .where(eq(notification.dedupeKey, `no_show:${stayId}:${env.base.customerId}`))
  )[0];

it("on the check-in day: stay no_show, event, audit, R-09, customer.no_show; the booking stays open with another stay", async () => {
  const b = await seedBooking({ stays: 2 });
  const [first = "", second = ""] = b.stayIds;
  const res = await noShow(first);
  expect(res.status).toBe(200);
  const card = StaysNoShowResponse.parse(await res.json());
  expect(card).toMatchObject({ id: first, status: "no_show" });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, first));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([["stay", "reserved", "no_show"]]);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, first));
  expect(audit).toMatchObject({ action: "booking.no_show", entityType: "stay", after: { status: "no_show", bookingId: b.bookingId } });
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(c).toMatchObject({ noShowCount12m: 1, reliabilityLevel: 2 });
  expect((await noteOf(first))?.payload).toEqual({
    petName: expect.any(String),
    moneyLine: "",
    bookAgainUrl: expect.stringContaining("/liff/"),
  });
  expect(await bookingRow(b.bookingId)).toMatchObject({ status: "confirmed" });
  expect((await env.db.select().from(stay).where(eq(stay.id, second)))[0]?.status).toBe("reserved");
});

it("the last stay after check-in day: booking closed, verified deposit forfeited, money line", async () => {
  const b = await seedBooking({ checkIn: localDay(-1), deposit: 50_000 });
  expect((await noShow(b.stayIds[0] ?? "")).status).toBe(200);
  expect(await bookingRow(b.bookingId)).toMatchObject({ status: "closed", depositStatus: "forfeited" });
  expect((await noteOf(b.stayIds[0] ?? ""))?.payload).toMatchObject({ moneyLine: "มัดจำ ฿500 ถูกริบตามนโยบายร้าน" });
});

it("before the check-in date → STATUS_NOT_ALLOWED {allowedFrom}", async () => {
  const checkIn = localDay(2);
  const b = await seedBooking({ checkIn });
  expect(await errorOf(await noShow(b.stayIds[0] ?? ""))).toMatchObject({ code: "STATUS_NOT_ALLOWED", details: { allowedFrom: checkIn } });
});

it.each(["checked_in", "checked_out", "cancelled", "no_show"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect((await errorOf(await noShow((await seedBooking({ stays: 2, status })).stayIds[0] ?? ""))).code).toBe("INVALID_TRANSITION");
});

it("bad id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect((await errorOf(await noShow("not-a-uuid"))).code).toBe("VALIDATION_FAILED");
  expect((await errorOf(await noShow((await seedBooking()).stayIds[0] ?? "", "staff"))).code).toBe("FORBIDDEN");
  expect((await errorOf(await noShow((await seedBooking({}, other)).stayIds[0] ?? ""))).code).toBe("NOT_FOUND");
});
