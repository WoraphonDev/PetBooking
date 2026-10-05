import { StaysCheckInParams, StaysCheckInRequest, StaysCheckInResponse } from "@app/contracts/endpoints/stays.checkIn";
import {
  auditLog,
  booking,
  bookingEvent,
  branchPolicy,
  careTask,
  consentDocument,
  fileObject,
  notification,
  pet,
  petVaccination,
  roomType,
  roomUnit,
  stay,
  stayIntake,
} from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysCheckIn } from "../../../src/services/stays/checkIn.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.checkIn", { body: StaysCheckInRequest, params: StaysCheckInParams }, staysCheckIn);
const DAY = 86_400_000;
/** branch-local date `days` from the real clock (the route uses it as ctx.now) */
const localDay = (days: number) => toLocalDate({ instant: new Date(Date.now() + days * DAY).toISOString(), timezone: "Asia/Bangkok" });
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, requiredVaccinesDog: ["DOG_RABIES"] });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a reserved stay from `checkIn` for 2 nights; intake / agreement / valid vaccine unless switched off */
async function seedStay(
  opts: {
    checkIn?: string;
    intake?: "complete" | "draft" | "none";
    agreement?: boolean;
    vaccine?: boolean;
    status?: typeof stay.$inferInsert.status;
  } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const checkIn = opts.checkIn ?? localDay(0);
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
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const [t] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [u] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: t?.id ?? "", code: `R${seq}` })
    .returning();
  const checkOut = toLocalDate({ instant: new Date(Date.parse(`${checkIn}T12:00:00Z`) + 2 * DAY).toISOString(), timezone: "UTC" });
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: t?.id ?? "",
      roomUnitId: u?.id ?? "",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
      status: opts.status ?? "reserved",
    })
    .returning();
  const id = s?.id ?? "";
  if ((opts.intake ?? "complete") !== "none")
    await env.db.insert(stayIntake).values({
      organizationId: org.orgId,
      stayId: id,
      feedingTimes: ["08:00", "18:00"],
      walksPerDay: 1,
      emergencyContactName: "แม่",
      emergencyContactPhone: "+66812345678",
      completedAt: (opts.intake ?? "complete") === "complete" ? new Date() : null,
    });
  if (opts.agreement ?? true) {
    const [sig] = await env.db
      .insert(fileObject)
      .values({
        organizationId: org.orgId,
        kind: "signature",
        storageKey: `org/x/signature/s${seq}.png`,
        mimeType: "image/png",
        sizeBytes: 1,
        uploadedByType: "staff",
        committedAt: new Date(),
      })
      .returning();
    await env.db.insert(consentDocument).values({
      organizationId: org.orgId,
      kind: "boarding_agreement",
      stayId: id,
      customerId: org.customerId,
      bodySnapshot: "ข้อตกลง",
      signerName: "มะลิ",
      signatureFileId: sig?.id ?? "",
    });
  }
  if (opts.vaccine ?? true)
    await env.db
      .insert(petVaccination)
      .values({ petId: p?.id ?? "", vaccineCode: "DOG_RABIES", expiresOn: "2030-01-01", status: "verified" });
  return { id, code: u?.code ?? "", petName: p?.name ?? "" };
}
async function checkIn(id: string, body: unknown = {}, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/check-in`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; details?: unknown } }).error;
const stayRow = async (id: string) => (await env.db.select().from(stay).where(eq(stay.id, id)))[0];

it("checks in on the check-in day: checked_in_at, weight, event, R-26 tasks, customer message", async () => {
  const s = await seedStay();
  const res = await checkIn(s.id, { weightGrams: 5200 });
  expect(res.status).toBe(200);
  const d = StaysCheckInResponse.parse(await res.json());
  expect(d.stay.status).toBe("checked_in");
  expect(d).toMatchObject({ weightGramsIn: 5200, vaccineOverrideReason: null });
  const row = await stayRow(s.id);
  expect(row?.checkedInAt).toBeInstanceOf(Date);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, s.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["reserved", "checked_in"]]);
  const tasks = await env.db.select().from(careTask).where(eq(careTask.stayId, s.id));
  expect(tasks.length).toBeGreaterThan(0);
  expect(new Set(tasks.map((t) => t.taskType))).toEqual(new Set(["feed", "walk", "clean"]));
  expect(d.tasks).toHaveLength(tasks.length);
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `stay_checked_in:${s.id}:${env.base.customerId}`));
  expect(note).toMatchObject({
    templateKey: "customer.stay_checked_in",
    payload: { petName: s.petName, roomCode: s.code, updatesUrl: expect.stringMatching(new RegExp(`/liff/[^/]+/stays/${s.id}$`)) },
  });
});

it("R-11 fails: VACCINE_REQUIRED without a reason; with one → override stored and audited", async () => {
  const s = await seedStay({ vaccine: false });
  expect(await errorOf(await checkIn(s.id))).toMatchObject({ code: "VACCINE_REQUIRED", details: { missing: ["DOG_RABIES"] } });
  expect((await stayRow(s.id))?.status).toBe("reserved");
  expect((await checkIn(s.id, { vaccineOverrideReason: "เจ้าของยืนยันฉีดแล้ว เอกสารตามมา" }, "owner")).status).toBe(200);
  expect(await stayRow(s.id)).toMatchObject({ status: "checked_in", vaccineOverrideReason: "เจ้าของยืนยันฉีดแล้ว เอกสารตามมา" });
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, s.id));
  expect(audit).toMatchObject({ action: "stay.vaccine_override", reason: "เจ้าของยืนยันฉีดแล้ว เอกสารตามมา" });
});

it("INTAKE_INCOMPLETE without a completed intake; CONSENT_REQUIRED without an agreement", async () => {
  for (const intake of ["none", "draft"] as const)
    expect((await errorOf(await checkIn((await seedStay({ intake })).id))).code).toBe("INTAKE_INCOMPLETE");
  expect((await errorOf(await checkIn((await seedStay({ agreement: false })).id))).code).toBe("CONSENT_REQUIRED");
});

it("before the check-in date → STATUS_NOT_ALLOWED; not reserved → INVALID_TRANSITION", async () => {
  const later = localDay(2);
  expect(await errorOf(await checkIn((await seedStay({ checkIn: later })).id))).toMatchObject({
    code: "STATUS_NOT_ALLOWED",
    details: { allowedFrom: later },
  });
  for (const status of ["checked_in", "cancelled"] as const)
    expect((await errorOf(await checkIn((await seedStay({ status })).id))).code).toBe("INVALID_TRANSITION");
});

it("bad body → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const s = await seedStay();
  expect((await errorOf(await checkIn(s.id, { weightGrams: -1 }))).code).toBe("VALIDATION_FAILED");
  expect((await errorOf(await checkIn(s.id, {}, "staff"))).code).toBe("FORBIDDEN");
  expect((await errorOf(await checkIn((await seedStay({}, other)).id))).code).toBe("NOT_FOUND");
});
