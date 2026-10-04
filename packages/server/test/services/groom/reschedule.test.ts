import { GroomRescheduleParams, GroomRescheduleRequest, GroomRescheduleResponse } from "@app/contracts/endpoints/groom.reschedule";
import {
  booking,
  bookingEvent,
  branchHours,
  branchPolicy,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  notification,
  pet,
  ratePlan,
  scheduledJob,
  service,
  servicePrice,
  sizeTier,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomReschedule } from "../../../src/services/groom/reschedule.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const PATCH = withStaff("groom.reschedule", { body: GroomRescheduleRequest, params: GroomRescheduleParams }, groomReschedule);
// Wednesdays at least a week after the real clock (the HTTP wrapper reads it); 10:00 / 13:00 Bangkok
const today = new Date();
const firstWednesday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7 + ((3 - today.getUTCDay() + 7) % 7));
const day = (week: number) => firstWednesday + 7 * week * 86_400_000;
const at = (week: number, hourLocal: number) => new Date(day(week) + (hourLocal - 7) * 3_600_000);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const ids = { station: "", bath: "", nails: "", tier: "", groomer: "" };

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db
    .insert(branchPolicy)
    .values({ branchId: env.base.branchId, slotStepMinutes: 30, bufferMinutes: 10, bookingHorizonDays: 365 });
  await env.db
    .insert(branchHours)
    .values({ branchId: env.base.branchId, weekday: 3, isClosed: false, opensAt: "09:00", closesAt: "18:00" });
  ids.groomer = env.base.staff.staff;
  await env.db.update(staffUser).set({ isGroomer: true }).where(eq(staffUser.id, ids.groomer));
  await env.db.insert(staffWorkingHours).values({ ...tenant, staffUserId: ids.groomer, weekday: 3, startsAt: "09:00", endsAt: "18:00" });
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "โต๊ะ 1" })
    .returning();
  ids.station = st?.id ?? "";
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: null })
    .returning();
  ids.tier = tier?.id ?? "";
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [bath, nails] = await env.db
    .insert(service)
    .values([
      { ...tenant, nameTh: "อาบน้ำ", category: "bath" },
      { ...tenant, nameTh: "ตัดเล็บ", category: "nail", isAddon: true },
    ])
    .returning();
  ids.bath = bath?.id ?? "";
  ids.nails = nails?.id ?? "";
  await env.db.insert(servicePrice).values([
    {
      organizationId: env.base.orgId,
      serviceId: ids.bath,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 40_000,
      durationMinutes: 45,
    },
    {
      organizationId: env.base.orgId,
      serviceId: ids.nails,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 5_000,
      durationMinutes: 15,
    },
  ]);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a 60-minute groom (bath + nails) of the shop groomer at `startsAt` */
async function seedAppt(startsAt: Date, status: typeof groomAppointment.$inferInsert.status = "scheduled", org: SeedOrg = env.base) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({
      ownerProfileId: org.ownerProfileId,
      createdInOrgId: org.orgId,
      name: `โมจิ${++seq}`,
      species: "dog",
      latestWeightGrams: 4_000,
    })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      firstServiceAt: startsAt,
    })
    .returning();
  let groomerId = ids.groomer;
  let stationId = ids.station;
  if (org !== env.base) {
    const [st] = await env.db
      .insert(groomStation)
      .values({ ...tenant, name: `T${seq}` })
      .returning();
    groomerId = org.staff.staff;
    stationId = st?.id ?? "";
  }
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId,
      stationId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 70 * 60_000),
      status,
      sizeTierId: org === env.base ? ids.tier : null,
    })
    .returning();
  if (org === env.base)
    await env.db.insert(groomAppointmentItem).values([
      {
        organizationId: org.orgId,
        appointmentId: a?.id ?? "",
        serviceId: ids.bath,
        nameSnapshot: "อาบน้ำ",
        priceSatang: 40_000,
        durationMinutes: 45,
      },
      {
        organizationId: org.orgId,
        appointmentId: a?.id ?? "",
        serviceId: ids.nails,
        nameSnapshot: "ตัดเล็บ",
        isAddon: true,
        priceSatang: 5_000,
        durationMinutes: 15,
      },
    ]);
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "reminder_24h",
    runAt: new Date(startsAt.getTime() - 86_400_000),
    payload: { bookingId: bk?.id, entityType: "groom_appointment", entityId: a?.id },
    dedupeKey: `reminder_24h:${a?.id}:${startsAt.toISOString()}`,
  });
  return { id: a?.id ?? "", bookingId: bk?.id ?? "", petName: p?.name ?? "" };
}
async function patch(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PATCH(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/reschedule`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const move = (to: Date, extra: Record<string, unknown> = {}) => ({
  startsAt: to.toISOString(),
  groomerId: ids.groomer,
  stationId: ids.station,
  ...extra,
});
const jobsOf = async (id: string) =>
  (await env.db.select().from(scheduledJob)).filter((j) => j.dedupeKey.startsWith(`reminder_24h:${id}:`));

it("moves to another R-04 slot: times from the item snapshots, first service, event, reminder replaced, customer told", async () => {
  const a = await seedAppt(at(0, 10));
  const to = at(0, 13);
  const res = await patch(a.id, move(to, { reason: "ลูกค้าขอเลื่อน" }));
  expect(res.status).toBe(200);
  const card = GroomRescheduleResponse.parse(await res.json());
  expect(card).toMatchObject({ id: a.id, status: "scheduled", startsAt: to.toISOString(), groomerId: ids.groomer, stationId: ids.station });
  const [saved] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, a.id));
  expect(saved?.endsAt).toEqual(new Date(to.getTime() + 60 * 60_000));
  expect(saved?.blockedUntil).toEqual(new Date(to.getTime() + 70 * 60_000));
  expect((await env.db.select().from(booking).where(eq(booking.id, a.bookingId)))[0]?.firstServiceAt).toEqual(to);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, a.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus, e.reason])).toEqual([["scheduled", "scheduled", "reschedule: ลูกค้าขอเลื่อน"]]);
  const jobs = await jobsOf(a.id);
  expect(jobs.map((j) => [j.dedupeKey, j.status]).sort()).toEqual(
    [
      [`reminder_24h:${a.id}:${at(0, 10).toISOString()}`, "cancelled"],
      [`reminder_24h:${a.id}:${to.toISOString()}`, "pending"],
    ].sort(),
  );
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `booking_rescheduled:${a.id}:${to.toISOString()}:${env.base.customerId}`));
  expect(note?.templateKey).toBe("customer.booking_rescheduled");
  expect(note?.payload).toMatchObject({
    petName: a.petName,
    oldDateTime: expect.stringContaining("10:00"),
    newDateTime: expect.stringContaining("13:00"),
  });
});

it("notifyCustomer false sends nothing; the reason defaults to 'reschedule'", async () => {
  const a = await seedAppt(at(1, 10));
  expect((await patch(a.id, move(at(1, 14), { notifyCustomer: false }))).status).toBe(200);
  expect((await env.db.select().from(notification)).filter((n) => n.dedupeKey.startsWith(`booking_rescheduled:${a.id}:`))).toEqual([]);
  const [ev] = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, a.id));
  expect(ev?.reason).toBe("reschedule");
});

it("SLOT_TAKEN when the groomer is busy then, or the time is off the slot grid", async () => {
  const a = await seedAppt(at(2, 10));
  await seedAppt(at(2, 15));
  expect(await codeOf(await patch(a.id, move(at(2, 15))))).toBe("SLOT_TAKEN");
  expect(await codeOf(await patch(a.id, move(new Date(at(2, 13).getTime() + 10 * 60_000))))).toBe("SLOT_TAKEN");
  expect((await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, a.id)))[0]?.startsAt).toEqual(at(2, 10));
});

it.each(["checked_in", "done", "cancelled"] as const)("a %s appointment → STATUS_NOT_ALLOWED", async (status) => {
  const week = 3 + seq;
  expect(await codeOf(await patch((await seedAppt(at(week, 10), status)).id, move(at(week, 13))))).toBe("STATUS_NOT_ALLOWED");
});

it.each([
  ["missing startsAt", { groomerId: "00000000-0000-4000-8000-000000000001", stationId: "00000000-0000-4000-8000-000000000002" }],
  [
    "bad time",
    { startsAt: "tomorrow", groomerId: "00000000-0000-4000-8000-000000000001", stationId: "00000000-0000-4000-8000-000000000002" },
  ],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await patch((await seedAppt(at(20 + seq, 10))).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's appointment → NOT_FOUND", async () => {
  const week = 40 + seq;
  expect(await codeOf(await patch((await seedAppt(at(week, 10))).id, move(at(week, 13)), "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await patch((await seedAppt(at(week + 1, 10), "scheduled", other)).id, move(at(week + 1, 13))))).toBe("NOT_FOUND");
});
