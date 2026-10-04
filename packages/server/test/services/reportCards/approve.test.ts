import { ReportCardsApproveParams, ReportCardsApproveResponse } from "@app/contracts/endpoints/reportCards.approve";
import { booking, branchPolicy, groomAppointment, groomStation, notification, pet, reportCard } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { reportCardsApprove } from "../../../src/services/reportCards/approve.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("reportCards.approve", { params: ReportCardsApproveParams }, reportCardsApprove);
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
async function approve(id: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/report-cards/${id}/approve`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { reportCardId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const keysOf = async (prefix: string) =>
  (await env.db.select().from(notification)).map((n) => n.dedupeKey).filter((k) => k.startsWith(prefix));

it("pending_review → sent with customer.report_card once the pickup was notified", async () => {
  const c = await seedCard({ status: "pending_review", pickupSent: true });
  const res = await approve(c.id);
  expect(res.status).toBe(200);
  const body = ReportCardsApproveResponse.parse(await res.json());
  expect(body.status).toBe("sent");
  expect(body.sentAt).not.toBeNull();
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `report_card:${c.id}:${env.base.customerId}`));
  expect(note?.payload).toEqual({ petName: c.petName, reportCardUrl: `https://petbooking.test/liff/shop-a/report-cards/${c.id}` });
});

it("pickup not notified yet: sent without its own message", async () => {
  const c = await seedCard({ status: "pending_review" });
  expect(ReportCardsApproveResponse.parse(await (await approve(c.id)).json()).status).toBe("sent");
  expect(await keysOf(`report_card:${c.id}:`)).toEqual([]);
});

it.each(["draft", "sent"] as const)("a %s card → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await approve((await seedCard({ status })).id))).toBe("INVALID_TRANSITION");
});

it("role staff → FORBIDDEN; malformed id → VALIDATION_FAILED; another org → NOT_FOUND", async () => {
  expect(await codeOf(await approve((await seedCard({ status: "pending_review" })).id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await approve("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await approve((await seedCard({ status: "pending_review" }, other)).id))).toBe("NOT_FOUND");
});
