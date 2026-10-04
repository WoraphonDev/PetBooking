import { ReportCardsSubmitParams, ReportCardsSubmitResponse } from "@app/contracts/endpoints/reportCards.submit";
import { booking, branchPolicy, groomAppointment, groomStation, notification, pet, reportCard } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { reportCardsSubmit } from "../../../src/services/reportCards/submit.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("reportCards.submit", { params: ReportCardsSubmitParams }, reportCardsSubmit);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  setStorage(createFakeStorage());
  env = await setupTestDb();
  other = await otherOrg(env.db);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, reportCardRequiresReview: false });
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db.update(branchPolicy).set({ reportCardRequiresReview: false }).where(eq(branchPolicy.branchId, env.base.branchId));
});

/** a done appointment's grooming report card (skin filled unless told otherwise) */
async function seedCard(
  opts: { status?: typeof reportCard.$inferInsert.status; author?: "staff" | "owner"; skin?: boolean; pickupSent?: boolean } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
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
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const startsAt = new Date(Date.UTC(2026, 8, 1, 3) + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: org.staff.staff,
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
      status: "done",
    })
    .returning();
  const [c] = await env.db
    .insert(reportCard)
    .values({
      ...tenant,
      kind: "grooming",
      appointmentId: a?.id,
      petId: p?.id ?? "",
      customerId: org.customerId,
      status: opts.status ?? "draft",
      skin: opts.skin === false ? null : "normal",
      createdBy: org.staff[opts.author ?? "staff"],
    })
    .returning();
  if (opts.pickupSent)
    await env.db.insert(notification).values({
      organizationId: org.orgId,
      branchId: org.branchId,
      channel: "line_push",
      recipientType: "customer",
      recipientId: org.customerId,
      templateKey: "customer.ready_for_pickup",
      payload: {},
      dedupeKey: `ready_for_pickup:${a?.id}:${org.customerId}`,
      monthKey: "2026-10",
    });
  return { id: c?.id ?? "", apptId: a?.id ?? "", petName: p?.name ?? "" };
}
async function submit(id: string, role: "owner" | "front_desk" | "staff" = "staff") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/report-cards/${id}/submit`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { reportCardId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const keysOf = async (prefix: string) =>
  (await env.db.select().from(notification)).map((n) => n.dedupeKey).filter((k) => k.startsWith(prefix));

it("no review needed, pickup already notified: sent + customer.report_card with the L-11 link", async () => {
  const c = await seedCard({ pickupSent: true });
  const res = await submit(c.id);
  expect(res.status).toBe(200);
  const body = ReportCardsSubmitResponse.parse(await res.json());
  expect(body.status).toBe("sent");
  expect(body.sentAt).not.toBeNull();
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `report_card:${c.id}:${env.base.customerId}`));
  expect(note?.payload).toEqual({ petName: c.petName, reportCardUrl: `https://petbooking.test/liff/shop-a/report-cards/${c.id}` });
});

it("pickup not notified yet: sent without its own message (it rides in ready_for_pickup)", async () => {
  const c = await seedCard();
  expect(ReportCardsSubmitResponse.parse(await (await submit(c.id)).json()).status).toBe("sent");
  expect(await keysOf(`report_card:${c.id}:`)).toEqual([]);
});

it("review required: pending_review and staff.report_card_review to each front desk", async () => {
  await env.db.update(branchPolicy).set({ reportCardRequiresReview: true }).where(eq(branchPolicy.branchId, env.base.branchId));
  const c = await seedCard({ pickupSent: true });
  expect(ReportCardsSubmitResponse.parse(await (await submit(c.id)).json())).toMatchObject({ status: "pending_review", sentAt: null });
  expect(await keysOf(`rc_review:${c.id}:`)).toEqual([`rc_review:${c.id}:${env.base.staff.front_desk}`]);
  expect(await keysOf(`report_card:${c.id}:`)).toEqual([]);
});

it("a grooming card without skin → VALIDATION_FAILED; not a draft → INVALID_TRANSITION", async () => {
  expect(await codeOf(await submit((await seedCard({ skin: false })).id))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await submit((await seedCard({ status: "sent" })).id))).toBe("INVALID_TRANSITION");
});

it("role staff cannot submit someone else's card; malformed id → VALIDATION_FAILED; another org → NOT_FOUND", async () => {
  expect(await codeOf(await submit((await seedCard({ author: "owner" })).id))).toBe("NOT_FOUND");
  expect(await codeOf(await submit("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await submit((await seedCard({}, other)).id, "owner"))).toBe("NOT_FOUND");
});
