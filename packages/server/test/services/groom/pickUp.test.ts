import { GroomPickUpParams, GroomPickUpResponse } from "@app/contracts/endpoints/groom.pickUp";
import {
  booking,
  bookingEvent,
  branchPolicy,
  groomAppointment,
  groomStation,
  pet,
  petShopProfile,
  scheduledJob,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomPickUp } from "../../../src/services/groom/pickUp.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.pickUp", { params: GroomPickUpParams }, groomPickUp);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

let seq = 0;
/** a confirmed booking with one appointment (own groomer + station, so exclusion constraints never trip) */
async function seedAppt(
  status: typeof groomAppointment.$inferInsert.status,
  org: SeedOrg = env.base,
  bookingValues: Partial<typeof booking.$inferInsert> = {},
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "โมจิ", species: "dog" })
    .returning();
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
      ...bookingValues,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const [groomer] = await env.db
    .insert(staffUser)
    .values({
      organizationId: org.orgId,
      email: `g${seq}@${org.orgId}.test`,
      displayName: `ช่าง ${seq}`,
      role: "staff",
      status: "active",
      isGroomer: true,
    })
    .returning();
  const startsAt = new Date(Date.UTC(2026, 9, 1, 3) + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: groomer?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
      status,
      doneAt: status === "done" ? new Date(startsAt.getTime() + 3_600_000) : null,
    })
    .returning();
  return { id: a?.id ?? "", bookingId: bk?.id ?? "", petId: p?.id ?? "" };
}
async function post(id: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/pick-up`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

const appt = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];

it("done → picked_up: picked_up_at, booking_event, pet_shop_profile.last_groomed_at = done_at, R-17 reminder job", async () => {
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, nextGroomDefaultDays: 30 });
  const a = await seedAppt("done");
  const res = await post(a.id);
  expect(res.status).toBe(200);
  const card = GroomPickUpResponse.parse(await res.json());
  const saved = await appt(a.id);
  expect(saved?.status).toBe("picked_up");
  expect(saved?.pickedUpAt).toBeInstanceOf(Date);
  expect(card).toMatchObject({ id: a.id, status: "picked_up", pickedUpAt: saved?.pickedUpAt?.toISOString() });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, a.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["done", "picked_up"]]);
  const [profile] = await env.db.select().from(petShopProfile).where(eq(petShopProfile.petId, a.petId));
  expect(profile?.lastGroomedAt).toEqual(saved?.doneAt);
  // visit on the appointment's local day + 30 days; remind 3 days earlier at 10:00 Bangkok
  const visit = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(saved?.startsAt);
  const due = new Date(Date.parse(`${visit}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const remind = new Date(Date.parse(`${due}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
  const [job] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `next_groom:${a.petId}:${due}`));
  expect(job).toMatchObject({ jobType: "next_groom_reminder", payload: { petId: a.petId, organizationId: env.base.orgId } });
  expect(job?.runAt.toISOString()).toBe(new Date(`${remind}T03:00:00.000Z`).toISOString());
});

it("updates an existing pet_shop_profile instead of adding one", async () => {
  const a = await seedAppt("done");
  await env.db.insert(petShopProfile).values({ organizationId: env.base.orgId, petId: a.petId, groomIntervalDays: 45 });
  expect((await post(a.id)).status).toBe(200);
  const rows = await env.db.select().from(petShopProfile).where(eq(petShopProfile.petId, a.petId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.groomIntervalDays).toBe(45);
  expect(rows[0]?.lastGroomedAt).toEqual((await appt(a.id))?.doneAt);
});

it.each(["scheduled", "checked_in", "in_progress", "picked_up"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await post((await seedAppt(status)).id))).toBe("INVALID_TRANSITION");
});

it("malformed id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await post("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post((await seedAppt("done")).id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post((await seedAppt("done", other)).id))).toBe("NOT_FOUND");
});
