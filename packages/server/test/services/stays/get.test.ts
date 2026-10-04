import { StaysGetParams, StaysGetResponse } from "@app/contracts/endpoints/stays.get";
import {
  booking,
  careTask,
  consentDocument,
  fileObject,
  pet,
  petPhoto,
  roomType,
  roomUnit,
  service,
  stay,
  stayAddon,
  stayBelonging,
  stayIntake,
  stayMedication,
} from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { staysGet } from "../../../src/services/stays/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.get", { params: StaysGetParams }, staysGet);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;

async function file(org: SeedOrg, kind: typeof fileObject.$inferInsert.kind) {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind,
      storageKey: `org/x/${kind}/f${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedByType: "staff",
      committedAt: new Date(),
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: "image/jpeg" });
  return f?.id ?? "";
}
async function seedStay(org: SeedOrg = env.base) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
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
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: t?.id ?? "",
      roomUnitId: u?.id ?? "",
      checkInDate: "2026-10-05",
      checkOutDate: "2026-10-07",
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
      status: "checked_in",
      weightGramsIn: 5200,
      checkedInAt: new Date("2026-10-05T03:00:00Z"),
    })
    .returning();
  return { id: s?.id ?? "", code: u?.code ?? "", petName: p?.name ?? "", customerId: org.customerId };
}

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

async function get(id: string) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.staff, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(new Request(`https://petbooking.test/api/v1/staff/stays/${id}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: { stayId: id },
  });
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("returns the stay in full (role staff): intake, medications, belongings, add-ons, tasks, photos, latest agreement", async () => {
  const s = await seedStay();
  const org = { organizationId: env.base.orgId };
  await env.db.insert(stayIntake).values({
    ...org,
    stayId: s.id,
    foodBrand: "Royal Canin",
    foodAmount: "1 ถ้วย",
    feedingTimes: ["08:00", "18:00"],
    walksPerDay: 2,
    conditionPhotoIds: [await file(env.base, "stay_update")],
    emergencyContactName: "แม่",
    emergencyContactPhone: "+66812345678",
    completedAt: new Date("2026-10-05T03:10:00Z"),
  });
  const [med] = await env.db
    .insert(stayMedication)
    .values({ ...org, stayId: s.id, name: "ยาหยอดหู", dose: "2 หยด", times: ["09:00"] })
    .returning();
  await env.db
    .insert(stayBelonging)
    .values({ ...org, stayId: s.id, item: "ผ้าห่ม", quantity: 1, photoFileId: await file(env.base, "stay_update") });
  const [svc] = await env.db
    .insert(service)
    .values({ ...org, branchId: env.base.branchId, nameTh: "พาเดินเล่น", category: "bath", scope: "hotel", isAddon: true })
    .returning();
  await env.db.insert(stayAddon).values({
    ...org,
    stayId: s.id,
    serviceId: svc?.id ?? "",
    nameSnapshot: "พาเดินเล่น",
    unitPriceSatang: 10_000,
    quantity: 2,
    totalSatang: 20_000,
    addedByType: "staff",
  });
  await env.db.insert(careTask).values([
    { ...org, branchId: env.base.branchId, stayId: s.id, taskType: "feed", title: "อาหารเช้า", dueAt: new Date("2026-10-06T01:00:00Z") },
    {
      ...org,
      branchId: env.base.branchId,
      stayId: s.id,
      taskType: "medication",
      title: "หยอดหู",
      dueAt: new Date("2026-10-06T02:00:00Z"),
      medicationId: med?.id,
      status: "done",
      doneAt: new Date("2026-10-06T02:05:00Z"),
      doneBy: env.base.staff.staff,
    },
  ]);
  await env.db.insert(petPhoto).values({
    ...org,
    petId: (await env.db.select().from(stay)).find((x) => x.id === s.id)?.petId ?? "",
    stayId: s.id,
    kind: "stay",
    fileId: await file(env.base, "stay_update"),
    takenAt: new Date("2026-10-06T04:00:00Z"),
    uploadedBy: env.base.staff.staff,
  });
  const sig = await file(env.base, "signature");
  for (const [name, at] of [
    ["คนแรก", "2026-10-05T03:00:00Z"],
    ["คนล่าสุด", "2026-10-05T03:05:00Z"],
  ] as const)
    await env.db.insert(consentDocument).values({
      ...org,
      kind: "boarding_agreement",
      stayId: s.id,
      customerId: s.customerId,
      bodySnapshot: "ข้อตกลง",
      emergencyVetLimitSatang: 300_000,
      signerName: name,
      signatureFileId: sig,
      signedAt: new Date(at),
    });

  const res = await get(s.id);
  expect(res.status).toBe(200);
  const d = StaysGetResponse.parse(await res.json());
  expect(d.stay).toMatchObject({ id: s.id, status: "checked_in", roomCode: s.code, agreementSigned: true, intakeCompleted: true });
  expect(d).toMatchObject({ weightGramsIn: 5200, weightGramsOut: null, checkedInAt: "2026-10-05T03:00:00.000Z", checkedOutAt: null });
  expect(d.intake).toMatchObject({ foodBrand: "Royal Canin", feedingTimes: ["08:00", "18:00"], walksPerDay: 2, foodProvidedByOwner: true });
  expect(d.intake?.conditionPhotoUrls).toHaveLength(1);
  expect(d.medications).toEqual([{ id: med?.id, name: "ยาหยอดหู", dose: "2 หยด", times: ["09:00"], instructions: null }]);
  expect(d.belongings).toEqual([expect.objectContaining({ item: "ผ้าห่ม", quantity: 1, photoUrl: expect.any(String), returnedAt: null })]);
  expect(d.addons).toEqual([expect.objectContaining({ name: "พาเดินเล่น", quantity: 2, totalSatang: 20_000 })]);
  expect(d.tasks.map((t) => [t.title, t.status, t.medication, t.doneByName === null, t.petName, t.roomCode])).toEqual([
    ["อาหารเช้า", "pending", null, true, s.petName, s.code],
    ["หยอดหู", "done", "ยาหยอดหู 2 หยด", false, s.petName, s.code],
  ]);
  expect(d.updates).toEqual([expect.objectContaining({ kind: "stay", stayId: s.id })]);
  expect(d.agreement).toEqual({ signerName: "คนล่าสุด", signedAt: "2026-10-05T03:05:00.000Z", emergencyVetLimitSatang: 300_000 });
});

it("a stay with nothing recorded yet: intake and agreement null, empty lists", async () => {
  const d = StaysGetResponse.parse(await (await get((await seedStay()).id)).json());
  expect(d).toMatchObject({ intake: null, agreement: null, medications: [], belongings: [], addons: [], tasks: [], updates: [] });
});

it("bad id → VALIDATION_FAILED; another org's stay → NOT_FOUND", async () => {
  expect(await codeOf(await get("nope"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await get((await seedStay(other)).id))).toBe("NOT_FOUND");
});
