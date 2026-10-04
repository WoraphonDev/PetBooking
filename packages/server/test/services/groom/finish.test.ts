import { GroomFinishParams, GroomFinishRequest, GroomFinishResponse } from "@app/contracts/endpoints/groom.finish";
import { booking, bookingEvent, groomAppointment, groomStation, notification, pet, reportCard, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomFinish } from "../../../src/services/groom/finish.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.finish", { body: GroomFinishRequest, params: GroomFinishParams }, groomFinish);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

async function seedAppt(
  status: typeof groomAppointment.$inferInsert.status,
  groomer: "staff" | "owner" = "staff",
  org: SeedOrg = env.base,
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
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const hour = 3_600_000 * seq;
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: org.staff[groomer],
      stationId: st?.id ?? "",
      startsAt: new Date(Date.UTC(2026, 9, 5) + hour),
      endsAt: new Date(Date.UTC(2026, 9, 5) + hour + 1_800_000),
      blockedUntil: new Date(Date.UTC(2026, 9, 5) + hour + 1_800_000),
      status,
    })
    .returning();
  return a?.id ?? "";
}
async function post(id: string, body: unknown = {}, role: "owner" | "front_desk" | "staff" = "staff") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/finish`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const row = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];

it("in_progress → done: done_at, staff note, one report_card draft, staff.groom_done to every front_desk", async () => {
  // a second active front_desk gets its own row; a disabled one gets none
  const [fd2] = await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, email: "fd2@a.test", displayName: "fd2", role: "front_desk", status: "active" })
    .returning();
  await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, email: "fd3@a.test", displayName: "fd3", role: "front_desk", status: "disabled" });
  const id = await seedAppt("in_progress");
  const res = await post(id, { staffNote: "  ขนพันกันหลังหู  " });
  expect(res.status).toBe(200);
  const card = GroomFinishResponse.parse(await res.json());
  const saved = await row(id);
  expect(saved).toMatchObject({ status: "done", staffNote: "ขนพันกันหลังหู" });
  expect(card).toMatchObject({ id, status: "done", doneAt: saved?.doneAt?.toISOString(), staffNote: "ขนพันกันหลังหู" });
  const cards = await env.db.select().from(reportCard).where(eq(reportCard.appointmentId, id));
  expect(cards).toEqual([
    expect.objectContaining({
      kind: "grooming",
      status: "draft",
      petId: saved?.petId,
      customerId: env.base.customerId,
      createdBy: env.base.staff.staff,
    }),
  ]);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["in_progress", "done"]]);
  const notes = await env.db.select().from(notification).where(eq(notification.templateKey, "staff.groom_done"));
  expect(notes.map((n) => n.recipientId).sort()).toEqual([env.base.staff.front_desk, fd2?.id].sort());
  expect(notes.map((n) => n.dedupeKey).sort()).toEqual(
    [`groom_done:${id}:${env.base.staff.front_desk}`, `groom_done:${id}:${fd2?.id}`].sort(),
  );
  expect(notes[0]?.payload).toEqual({ petName: "โมจิ", groomerName: "staff" });
});

it("keeps an existing report card instead of creating a second draft", async () => {
  const id = await seedAppt("in_progress");
  const saved = await row(id);
  await env.db.insert(reportCard).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    kind: "grooming",
    appointmentId: id,
    petId: saved?.petId ?? "",
    customerId: env.base.customerId,
    createdBy: env.base.staff.owner,
  });
  expect((await post(id)).status).toBe(200);
  expect(await env.db.select().from(reportCard).where(eq(reportCard.appointmentId, id))).toHaveLength(1);
});

it.each(["scheduled", "checked_in", "done"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await post(await seedAppt(status)))).toBe("INVALID_TRANSITION");
});

it("staff note over 1000 → VALIDATION_FAILED; another org's appointment → NOT_FOUND", async () => {
  expect(await codeOf(await post(await seedAppt("in_progress"), { staffNote: "x".repeat(1001) }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post(await seedAppt("in_progress", "staff", other), {}, "owner"))).toBe("NOT_FOUND");
});
