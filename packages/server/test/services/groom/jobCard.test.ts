import { GroomJobCardParams, GroomJobCardResponse } from "@app/contracts/endpoints/groom.jobCard";
import {
  bill,
  booking,
  consentDocument,
  fileObject,
  groomAppointment,
  groomStation,
  pet,
  petPhoto,
  petShopProfile,
  petTemperamentFlag,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { groomJobCard } from "../../../src/services/groom/jobCard.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("groom.jobCard", { params: GroomJobCardParams }, groomJobCard);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
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

let seq = 0;
/** an appointment (own groomer + station) of a confirmed booking, optionally with a bill */
async function seedAppt(
  opts: { status?: typeof groomAppointment.$inferInsert.status; bill?: "open" | "paid"; startsAt?: Date; petId?: string } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const petId =
    opts.petId ??
    (
      await env.db
        .insert(pet)
        .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
        .returning()
    )[0]?.id ??
    "";
  const [b] = opts.bill
    ? await env.db
        .insert(bill)
        .values({
          ...tenant,
          customerId: org.customerId,
          openedBy: org.staff.owner,
          status: opts.bill,
          subtotalSatang: 40_000,
          totalSatang: 40_000,
          paidSatang: opts.bill === "paid" ? 40_000 : 0,
        })
        .returning()
    : [];
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
      billId: b?.id ?? null,
      customerNote: "กลัวไดร์",
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const [g] = await env.db
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
  const startsAt = opts.startsAt ?? new Date(Date.UTC(2026, 10, 1, 3) + seq * 86_400_000);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId,
      groomerId: g?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
      status: opts.status ?? "checked_in",
    })
    .returning();
  return { id: a?.id ?? "", billId: b?.id ?? "", petId };
}
async function call(
  url: string,
  method: string,
  params: Record<string, string>,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const card = (id: string, role: "owner" | "front_desk" | "staff" = "staff") =>
  call(`/groom-appointments/${id}/job-card`, "GET", { appointmentId: id }, undefined, role);
async function photo(org: SeedOrg, petId: string, appointmentId: string | null, kind: "before" | "after" | "profile") {
  const key = `org/${org.orgId}/${kind}/2026/10/p${++seq}.jpg`;
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind: kind === "profile" ? "pet_profile" : kind,
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
    .values({ organizationId: org.orgId, petId, kind, fileId: f?.id ?? "", appointmentId, uploadedBy: org.staff.staff })
    .returning();
  return { id: p?.id ?? "", key };
}

it("staff reads the job card: profile, flags, check-in condition, customer note, this and last visit photos, consent", async () => {
  const prev = await seedAppt({ status: "picked_up", startsAt: new Date("2026-09-01T03:00:00Z") });
  await env.db.update(groomAppointment).set({ staffNote: "ชอบตัดสั้น" }).where(eq(groomAppointment.id, prev.id));
  const a = await seedAppt({ petId: prev.petId });
  await env.db
    .update(groomAppointment)
    .set({ weightGramsCheckin: 5_200, conditionFlags: ["matted"], conditionNote: "หลังหู" })
    .where(eq(groomAppointment.id, a.id));
  const fav = await photo(env.base, prev.petId, null, "profile");
  await env.db.insert(petShopProfile).values({
    organizationId: env.base.orgId,
    petId: prev.petId,
    preferredStyle: "ทรงหมี",
    bladeNo: "#7",
    shampooOk: "โอ๊ต",
    shampooAvoid: "น้ำหอม",
    allergies: "ไก่",
    conditions: "ผิวแพ้ง่าย",
    internalNote: "กัดตอนตัดเล็บ",
    favoriteStylePhotoId: fav.id,
  });
  await env.db.insert(petTemperamentFlag).values({ organizationId: env.base.orgId, petId: prev.petId, flag: "bites", note: "ตอนตัดเล็บ" });
  const before = await photo(env.base, prev.petId, a.id, "before");
  const old = await photo(env.base, prev.petId, prev.id, "after");
  const [sig] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "signature",
      storageKey: `org/x/signature/${++seq}.png`,
      mimeType: "image/png",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  await env.db.insert(consentDocument).values({
    organizationId: env.base.orgId,
    kind: "grooming_consent",
    appointmentId: a.id,
    customerId: env.base.customerId,
    bodySnapshot: "x",
    signerName: "มะลิ",
    signatureFileId: sig?.id ?? "",
  });

  const res = await card(a.id);
  expect(res.status).toBe(200);
  const body = GroomJobCardResponse.parse(await res.json());
  expect(body).toMatchObject({
    appointment: { id: a.id, status: "checked_in" },
    preferredStyle: "ทรงหมี",
    bladeNo: "#7",
    shampooOk: "โอ๊ต",
    shampooAvoid: "น้ำหอม",
    allergies: "ไก่",
    conditions: "ผิวแพ้ง่าย",
    internalNote: "กัดตอนตัดเล็บ",
    favoriteStylePhotoUrl: `https://storage.test/${fav.key}?op=get&expires=3600`,
    flags: [{ flag: "bites", note: "ตอนตัดเล็บ" }],
    weightGramsCheckin: 5_200,
    conditionFlags: ["matted"],
    conditionNote: "หลังหู",
    customerNote: "กลัวไดร์",
    lastVisit: { staffNote: "ชอบตัดสั้น", photos: [expect.objectContaining({ id: old.id })] },
    photos: [expect.objectContaining({ id: before.id, kind: "before" })],
    consentSigned: true,
  });
});

it("first visit: empty profile fields, no last visit, no consent", async () => {
  const body = GroomJobCardResponse.parse(await (await card((await seedAppt()).id)).json());
  expect(body).toMatchObject({
    preferredStyle: null,
    favoriteStylePhotoUrl: null,
    flags: [],
    lastVisit: null,
    photos: [],
    consentSigned: false,
  });
});

it("malformed id → VALIDATION_FAILED; another org → NOT_FOUND", async () => {
  expect(await codeOf(await card("x"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await card((await seedAppt({}, other)).id))).toBe("NOT_FOUND");
});
