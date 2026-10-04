import { ReportCardsUpdateParams, ReportCardsUpdateRequest, ReportCardsUpdateResponse } from "@app/contracts/endpoints/reportCards.update";
import { booking, branchPolicy, groomAppointment, groomAppointmentItem, groomStation, pet, reportCard, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { reportCardsUpdate } from "../../../src/services/reportCards/update.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("reportCards.update", { body: ReportCardsUpdateRequest, params: ReportCardsUpdateParams }, reportCardsUpdate);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
const services = new Map<string, string>();
const svc = (org: SeedOrg) => services.get(org.orgId) ?? "";
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  storage = createFakeStorage();
  setStorage(storage);
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) {
    const [s] = await env.db
      .insert(service)
      .values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "อาบน้ำ", category: "bath" })
      .returning();
    services.set(org.orgId, s?.id ?? "");
  }
  await env.db
    .insert(branchPolicy)
    .values({ branchId: env.base.branchId, googleReviewUrl: "https://g.page/r/shop-a/review", nextGroomDefaultDays: 30 });
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

let seq = 0;
/** a done appointment (item "อาบน้ำ", groomer = shop staff) with a report card created by `author` */
async function seedCard(
  opts: {
    status?: typeof reportCard.$inferInsert.status;
    author?: "staff" | "owner";
    values?: Partial<typeof reportCard.$inferInsert>;
  } = {},
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
  await env.db.insert(groomAppointmentItem).values({
    organizationId: org.orgId,
    appointmentId: a?.id ?? "",
    serviceId: svc(org),
    nameSnapshot: "อาบน้ำ",
    priceSatang: 1,
    durationMinutes: 60,
  });
  const [c] = await env.db
    .insert(reportCard)
    .values({
      ...tenant,
      kind: "grooming",
      appointmentId: a?.id,
      petId: p?.id ?? "",
      customerId: org.customerId,
      status: opts.status ?? "draft",
      createdBy: org.staff[opts.author ?? "staff"],
      ...opts.values,
    })
    .returning();
  return { id: c?.id ?? "", apptId: a?.id ?? "", petId: p?.id ?? "" };
}
async function call(
  path: string,
  method: string,
  params: Record<string, string>,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "staff",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/report-cards${path}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const update = (id: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call(`/${id}`, "PUT", { reportCardId: id }, body, role);
const row = async (id: string) => (await env.db.select().from(reportCard).where(eq(reportCard.id, id)))[0];

it("fills the checks; fields left out keep their value, null clears", async () => {
  const c = await seedCard({ values: { teeth: "tartar", recommendation: "แปรงฟัน" } });
  const res = await update(c.id, {
    skin: "normal",
    ears: "clean",
    nails: "trimmed",
    parasites: "none",
    cooperation: 5,
    staffNote: " เรียบร้อย ",
    recommendation: null,
  });
  expect(res.status).toBe(200);
  const body = ReportCardsUpdateResponse.parse(await res.json());
  expect(body).toMatchObject({
    skin: "normal",
    ears: "clean",
    nails: "trimmed",
    teeth: "tartar",
    parasites: "none",
    cooperation: 5,
    staffNote: "เรียบร้อย",
    recommendation: null,
  });
  expect(await row(c.id)).toMatchObject({ skin: "normal", teeth: "tartar", staffNote: "เรียบร้อย", recommendation: null });
});

it("pending_review is still editable; sent → STATUS_NOT_ALLOWED", async () => {
  expect((await update((await seedCard({ status: "pending_review" })).id, { cooperation: 3 })).status).toBe(200);
  const sent = await seedCard({ status: "sent" });
  expect(await codeOf(await update(sent.id, { cooperation: 3 }))).toBe("STATUS_NOT_ALLOWED");
  expect((await row(sent.id))?.cooperation).toBeNull();
});

it.each([
  ["cooperation 6", { cooperation: 6 }],
  ["unknown skin", { skin: "oily" }],
  ["note over 500", { staffNote: "x".repeat(501) }],
  ["recommendation over 300", { recommendation: "x".repeat(301) }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await update((await seedCard()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff cannot edit someone else's card; another org → NOT_FOUND", async () => {
  expect(await codeOf(await update((await seedCard({ author: "owner" })).id, { cooperation: 3 }))).toBe("NOT_FOUND");
  expect(await codeOf(await update((await seedCard({}, other)).id, { cooperation: 3 }, "owner"))).toBe("NOT_FOUND");
});
