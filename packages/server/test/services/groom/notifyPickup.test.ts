import { GroomNotifyPickupParams, GroomNotifyPickupResponse } from "@app/contracts/endpoints/groom.notifyPickup";
import { bill, booking, groomAppointment, groomStation, notification, pet, reportCard, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomNotifyPickup } from "../../../src/services/groom/notifyPickup.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.notifyPickup", { params: GroomNotifyPickupParams }, groomNotifyPickup);
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
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/notify-pickup`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

const noteOf = async (id: string) =>
  (await env.db.select().from(notification).where(eq(notification.templateKey, "customer.ready_for_pickup"))).filter((n) =>
    n.dedupeKey.startsWith(`ready_for_pickup:${id}:`),
  );

it("done appointment: customer.ready_for_pickup with estimate − verified deposit when no bill, no report card line", async () => {
  const a = await seedAppt("done", env.base, { estimatedTotalSatang: 80_000, depositVerifiedSatang: 30_000, depositStatus: "verified" });
  const res = await post(a.id);
  expect(res.status).toBe(200);
  expect(GroomNotifyPickupResponse.parse(await res.json())).toMatchObject({ id: a.id, status: "done" });
  const notes = await noteOf(a.id);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ recipientId: env.base.customerId, dedupeKey: `ready_for_pickup:${a.id}:${env.base.customerId}` });
  expect(notes[0]?.payload).toEqual({ petName: "โมจิ", reportCardUrl: "", balance: "฿500" });
});

it("an open bill gives its due; a sent report card rides in the same message", async () => {
  const a = await seedAppt("done");
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      openedBy: env.base.staff.owner,
      subtotalSatang: 120_000,
      totalSatang: 120_000,
      paidSatang: 20_050,
    })
    .returning();
  await env.db.update(booking).set({ billId: b?.id }).where(eq(booking.id, a.bookingId));
  const [card] = await env.db
    .insert(reportCard)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      kind: "grooming",
      appointmentId: a.id,
      petId: a.petId,
      customerId: env.base.customerId,
      status: "sent",
      createdBy: env.base.staff.staff,
    })
    .returning();
  expect((await post(a.id)).status).toBe(200);
  const [note] = await noteOf(a.id);
  expect(note?.payload).toEqual({
    petName: "โมจิ",
    reportCardUrl: `https://petbooking.test/liff/shop-a/report-cards/${card?.id}`,
    balance: "฿999.50",
  });
});

it("pressing twice keeps one message (dedupe)", async () => {
  const a = await seedAppt("done");
  await post(a.id);
  await post(a.id);
  expect(await noteOf(a.id)).toHaveLength(1);
});

it.each(["scheduled", "checked_in", "in_progress", "picked_up"] as const)("from %s → STATUS_NOT_ALLOWED (Q-0098)", async (status) => {
  const a = await seedAppt(status);
  expect(await codeOf(await post(a.id))).toBe("STATUS_NOT_ALLOWED");
  expect(await noteOf(a.id)).toEqual([]);
});

it("malformed id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await post("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post((await seedAppt("done")).id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post((await seedAppt("done", other)).id))).toBe("NOT_FOUND");
});
