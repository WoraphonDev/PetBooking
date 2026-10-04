import { ReportCardsGetParams, ReportCardsGetResponse } from "@app/contracts/endpoints/reportCards.get";
import {
  booking,
  branchPolicy,
  fileObject,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  pet,
  petPhoto,
  reportCard,
  service,
} from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { reportCardsGet } from "../../../src/services/reportCards/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("reportCards.get", { params: ReportCardsGetParams }, reportCardsGet);
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
const get = (id: string, role?: "owner" | "front_desk" | "staff") => call(`/${id}`, "GET", { reportCardId: id }, undefined, role);
async function photo(petId: string, apptId: string, kind: "before" | "after") {
  const key = `org/${env.base.orgId}/${kind}/2026/10/p${++seq}.jpg`;
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind,
      storageKey: key,
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
      committedAt: new Date(),
    })
    .returning();
  storage.put(key, { sizeBytes: 10, contentType: "image/jpeg" });
  const [p] = await env.db
    .insert(petPhoto)
    .values({ organizationId: env.base.orgId, petId, kind, fileId: f?.id ?? "", appointmentId: apptId, uploadedBy: env.base.staff.staff })
    .returning();
  return p?.id ?? "";
}

it("returns the full ReportCardDetail: pet, groomer, photos by kind, services, next due, review link", async () => {
  const c = await seedCard({
    status: "sent",
    values: {
      skin: "dry",
      cooperation: 4,
      staffNote: "น่ารัก",
      sentAt: new Date("2026-10-02T05:00:00Z"),
      customerRating: 5,
      customerFeedback: "ดีมาก",
    },
  });
  const before = await photo(c.petId, c.apptId, "before");
  const after = await photo(c.petId, c.apptId, "after");
  const res = await get(c.id);
  expect(res.status).toBe(200);
  const body = ReportCardsGetResponse.parse(await res.json());
  expect(body).toMatchObject({
    id: c.id,
    kind: "grooming",
    status: "sent",
    pet: { id: c.petId },
    appointmentId: c.apptId,
    stayId: null,
    skin: "dry",
    cooperation: 4,
    staffNote: "น่ารัก",
    groomerName: "staff",
    beforePhotos: [expect.objectContaining({ id: before })],
    afterPhotos: [expect.objectContaining({ id: after })],
    services: ["อาบน้ำ"],
    sentAt: "2026-10-02T05:00:00.000Z",
    customerRating: 5,
    customerFeedback: "ดีมาก",
    googleReviewUrl: "https://g.page/r/shop-a/review",
  });
  expect(body.nextGroomDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("role staff reads only their own cards; front desk reads any", async () => {
  const c = await seedCard({ author: "owner" });
  expect(await codeOf(await get(c.id, "staff"))).toBe("NOT_FOUND");
  expect((await get(c.id, "front_desk")).status).toBe(200);
});

it("malformed id → VALIDATION_FAILED; another org → NOT_FOUND", async () => {
  expect(await codeOf(await get("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await get((await seedCard({}, other)).id, "owner"))).toBe("NOT_FOUND");
});
