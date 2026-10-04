import { GroomCheckInParams, GroomCheckInRequest, GroomCheckInResponse } from "@app/contracts/endpoints/groom.checkIn";
import {
  booking,
  bookingEvent,
  branchPolicy,
  consentDocument,
  fileObject,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  pet,
  petWeight,
  ratePlan,
  service,
  servicePrice,
  sizeTier,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { groomCheckIn } from "../../../src/services/groom/checkIn.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.checkIn", { body: GroomCheckInRequest, params: GroomCheckInParams }, groomCheckIn);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
const ids = { small: "", medium: "", bath: "" };
let seq = 0;

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, groomingConsentText: "ยินยอมให้ไถขนเนื่องจากขนพันกัน" });
  const [s, m] = await env.db
    .insert(sizeTier)
    .values([
      { ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 },
      { ...tenant, species: "dog", code: "M", labelTh: "กลาง", minWeightGrams: 10_000, maxWeightGrams: null },
    ])
    .returning();
  ids.small = s?.id ?? "";
  ids.medium = m?.id ?? "";
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  ids.bath = bath?.id ?? "";
  await env.db.insert(servicePrice).values([
    {
      organizationId: env.base.orgId,
      serviceId: ids.bath,
      ratePlanId: plan?.id ?? "",
      sizeTierId: ids.small,
      coatGroup: "any",
      priceSatang: 40_000,
      durationMinutes: 60,
    },
    {
      organizationId: env.base.orgId,
      serviceId: ids.bath,
      ratePlanId: plan?.id ?? "",
      sizeTierId: ids.medium,
      coatGroup: "any",
      priceSatang: 55_000,
      durationMinutes: 75,
    },
  ]);
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => {
  storage = createFakeStorage();
  setStorage(storage);
  resetRateLimits();
});

/** today's appointment (starts now) of a small dog, unless told otherwise */
async function seedAppt(
  opts: { startsAt?: Date; status?: typeof groomAppointment.$inferInsert.status; bookingStatus?: typeof booking.$inferInsert.status } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({
      ownerProfileId: org.ownerProfileId,
      createdInOrgId: org.orgId,
      name: `โมจิ${++seq}`,
      species: "dog",
      latestWeightGrams: 8_000,
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
      status: opts.bookingStatus ?? "confirmed",
      policySnapshot: {},
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
  const startsAt = opts.startsAt ?? new Date();
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
      status: opts.status ?? "scheduled",
      sizeTierId: org === env.base ? ids.small : null,
      servicesTotalSatang: 40_000,
    })
    .returning();
  if (org === env.base)
    await env.db.insert(groomAppointmentItem).values({
      organizationId: org.orgId,
      appointmentId: a?.id ?? "",
      serviceId: ids.bath,
      nameSnapshot: "อาบน้ำ",
      priceSatang: 40_000,
      durationMinutes: 60,
    });
  return { id: a?.id ?? "", petId: p?.id ?? "", customerId: org.customerId };
}
async function signature() {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "signature",
      storageKey: `org/x/signature/s${++seq}.png`,
      mimeType: "image/png",
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: "image/png" });
  return f?.id ?? "";
}
async function post(id: string, body: unknown = {}, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/check-in`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const appt = async (id: string) => (await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0];

it("checks in with weight, conditions and a consent: saved per 'maps to', pet_weight, consent body snapshot", async () => {
  const a = await seedAppt();
  const sig = await signature();
  const res = await post(a.id, {
    weightGrams: 9_500,
    conditionFlags: ["matted", "ticks_fleas"],
    conditionNote: " ขนพันหลังหู ",
    consent: { reasons: ["matted_shave"], signerName: "มะลิ", signatureFileId: sig },
  });
  expect(res.status).toBe(200);
  const card = GroomCheckInResponse.parse(await res.json());
  expect(card).toMatchObject({ id: a.id, status: "checked_in" });
  expect(card.warnings).toBeUndefined();
  const saved = await appt(a.id);
  expect(saved).toMatchObject({
    status: "checked_in",
    weightGramsCheckin: 9_500,
    conditionFlags: ["matted", "ticks_fleas"],
    conditionNote: "ขนพันหลังหู",
  });
  expect(saved?.checkedInAt).toBeInstanceOf(Date);
  const [w] = await env.db.select().from(petWeight).where(eq(petWeight.appointmentId, a.id));
  expect(w).toMatchObject({ petId: a.petId, weightGrams: 9_500, source: "shop", recordedBy: env.base.staff.front_desk });
  expect((await env.db.select().from(pet).where(eq(pet.id, a.petId)))[0]?.latestWeightGrams).toBe(9_500);
  const [doc] = await env.db.select().from(consentDocument).where(eq(consentDocument.appointmentId, a.id));
  expect(doc).toMatchObject({
    kind: "grooming_consent",
    customerId: a.customerId,
    reasons: ["matted_shave"],
    bodySnapshot: "ยินยอมให้ไถขนเนื่องจากขนพันกัน",
    signerName: "มะลิ",
    signatureFileId: sig,
  });
  expect((await env.db.select().from(fileObject).where(eq(fileObject.id, sig)))[0]?.committedAt).not.toBeNull();
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, a.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["scheduled", "checked_in"]]);
});

it("a weight that crosses into another size tier answers SIZE_CHANGED with the new price", async () => {
  const a = await seedAppt();
  const card = GroomCheckInResponse.parse(await (await post(a.id, { weightGrams: 12_000 })).json());
  expect(card.warnings).toEqual([
    { code: "SIZE_CHANGED", message: expect.any(String), data: { newSizeTierId: ids.medium, newPriceSatang: 55_000 } },
  ]);
  // the price itself changes only through groom.setItems
  expect((await appt(a.id))?.servicesTotalSatang).toBe(40_000);
});

it("awaiting_deposit (paid at the counter) may check in; without weight nothing is recorded", async () => {
  const a = await seedAppt({ bookingStatus: "awaiting_deposit" });
  expect((await post(a.id)).status).toBe(200);
  expect(await env.db.select().from(petWeight).where(eq(petWeight.appointmentId, a.id))).toEqual([]);
});

it("matted / skin_issue without consent → CONSENT_REQUIRED", async () => {
  for (const flag of ["matted", "skin_issue"]) {
    const a = await seedAppt();
    expect(await codeOf(await post(a.id, { conditionFlags: [flag] }))).toBe("CONSENT_REQUIRED");
    expect((await appt(a.id))?.status).toBe("scheduled");
  }
});

it("another day, or a booking not confirmed → STATUS_NOT_ALLOWED", async () => {
  expect(await codeOf(await post((await seedAppt({ startsAt: new Date(Date.now() + 2 * 86_400_000) })).id))).toBe("STATUS_NOT_ALLOWED");
  expect(await codeOf(await post((await seedAppt({ bookingStatus: "awaiting_approval" })).id))).toBe("STATUS_NOT_ALLOWED");
});

it.each(["checked_in", "in_progress", "cancelled"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await post((await seedAppt({ status })).id))).toBe("INVALID_TRANSITION");
});

it.each([
  ["weight below 100 g", { weightGrams: 99 }],
  ["unknown condition", { conditionFlags: ["fat"] }],
  ["note over 500", { conditionNote: "x".repeat(501) }],
  ["consent without signer", { consent: { reasons: ["senior"], signatureFileId: "00000000-0000-4000-8000-000000000001" } }],
  ["consent without signature", { consent: { reasons: ["senior"], signerName: "มะลิ" } }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await post((await seedAppt()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await post((await seedAppt()).id, {}, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post((await seedAppt({}, other)).id))).toBe("NOT_FOUND");
});
