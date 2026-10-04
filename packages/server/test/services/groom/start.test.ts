import { GroomStartParams, GroomStartResponse } from "@app/contracts/endpoints/groom.start";
import { booking, bookingEvent, groomAppointment, groomStation, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomStart } from "../../../src/services/groom/start.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.start", { params: GroomStartParams }, groomStart);
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
async function post(id: string, role: "owner" | "front_desk" | "staff" = "staff") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/start`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const row = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];

it("the appointment's groomer starts it: checked_in → in_progress, started_at, booking_event", async () => {
  const id = await seedAppt("checked_in");
  const res = await post(id);
  expect(res.status).toBe(200);
  const card = GroomStartResponse.parse(await res.json());
  const saved = await row(id);
  expect(saved?.status).toBe("in_progress");
  expect(saved?.startedAt).toBeInstanceOf(Date);
  expect(card).toMatchObject({ id, status: "in_progress", startedAt: saved?.startedAt?.toISOString(), groomerName: "staff" });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([["groom_appointment", "checked_in", "in_progress"]]);
});

it("owner / front_desk may start any groomer's appointment", async () => {
  for (const role of ["owner", "front_desk"] as const) expect((await post(await seedAppt("checked_in"), role)).status).toBe(200);
});

it("role staff cannot start another groomer's appointment → FORBIDDEN", async () => {
  const id = await seedAppt("checked_in", "owner");
  expect(await codeOf(await post(id))).toBe("FORBIDDEN");
  expect((await row(id))?.status).toBe("checked_in");
});

it.each(["scheduled", "in_progress", "done", "cancelled"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await post(await seedAppt(status)))).toBe("INVALID_TRANSITION");
});

it("malformed id → VALIDATION_FAILED; another org's appointment → NOT_FOUND", async () => {
  expect(await codeOf(await post("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post(await seedAppt("checked_in", "staff", other), "owner"))).toBe("NOT_FOUND");
});
