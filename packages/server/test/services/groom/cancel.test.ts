import { GroomCancelParams, GroomCancelRequest, GroomCancelResponse } from "@app/contracts/endpoints/groom.cancel";
import { booking, bookingEvent, groomAppointment, groomStation, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomCancel } from "../../../src/services/groom/cancel.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.cancel", { body: GroomCancelRequest, params: GroomCancelParams }, groomCancel);
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
  bookingId?: string,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const [bk] = bookingId
    ? await env.db.select().from(booking).where(eq(booking.id, bookingId))
    : await env.db
        .insert(booking)
        .values({
          ...tenant,
          customerId: org.customerId,
          bookingNo: `B6910-${++seq}`,
          channel: "walk_in",
          createdByType: "staff",
          status: "confirmed",
          policySnapshot: {},
          estimatedTotalSatang: 100_000,
        })
        .returning();
  seq++;
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
      servicesTotalSatang: 40_000,
      surchargeTotalSatang: 5_000,
    })
    .returning();
  return a?.id ?? "";
}
async function post(id: string, body: unknown = { reason: "ลูกค้าขอยกเลิกตัวนี้" }, role: "owner" | "front_desk" | "staff" = "front_desk") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/cancel`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const row = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];

it.each(["scheduled", "checked_in"] as const)("cancels one %s appointment of a two-pet booking and lowers the estimate", async (status) => {
  const first = await seedAppt(status);
  const bookingId = (await row(first))?.bookingId ?? "";
  const second = await seedAppt("scheduled", "staff", env.base, bookingId);
  const res = await post(first);
  expect(res.status).toBe(200);
  const detail = GroomCancelResponse.parse(await res.json());
  expect((await row(first))?.status).toBe("cancelled");
  expect((await row(second))?.status).toBe("scheduled");
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, bookingId));
  expect(bk?.estimatedTotalSatang).toBe(55_000);
  expect(detail).toMatchObject({ id: bookingId, estimatedTotalSatang: 55_000, status: "confirmed" });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, first));
  expect(events.map((e) => [e.fromStatus, e.toStatus, e.reason])).toEqual([[status, "cancelled", "ลูกค้าขอยกเลิกตัวนี้"]]);
});

it("the last active item → STATUS_NOT_ALLOWED with a bookings.cancel hint", async () => {
  const id = await seedAppt("scheduled");
  const res = await post(id);
  const body = (await res.json()) as { error: { code: string; details: Record<string, unknown> } };
  expect(body.error).toMatchObject({ code: "STATUS_NOT_ALLOWED", details: { hint: "bookings.cancel" } });
  expect((await row(id))?.status).toBe("scheduled");
});

it.each(["in_progress", "done", "no_show"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  const keep = await seedAppt("scheduled");
  const id = await seedAppt(status, "staff", env.base, (await row(keep))?.bookingId);
  expect(await codeOf(await post(id))).toBe("INVALID_TRANSITION");
});

it("reason shorter than 3 → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const id = await seedAppt("scheduled");
  expect(await codeOf(await post(id, { reason: "ab" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post(id, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post(await seedAppt("scheduled", "staff", other), undefined, "owner"))).toBe("NOT_FOUND");
});
