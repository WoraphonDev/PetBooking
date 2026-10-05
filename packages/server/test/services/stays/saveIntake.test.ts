import { StaysSaveIntakeParams, StaysSaveIntakeRequest, StaysSaveIntakeResponse } from "@app/contracts/endpoints/stays.saveIntake";
import { booking, careTask, fileObject, pet, roomType, roomUnit, stay, stayBelonging, stayIntake, stayMedication } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { staysSaveIntake } from "../../../src/services/stays/saveIntake.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.saveIntake", { body: StaysSaveIntakeRequest, params: StaysSaveIntakeParams }, staysSaveIntake);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;

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

async function upload(kind: typeof fileObject.$inferInsert.kind = "stay_update") {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind,
      storageKey: `org/x/${kind}/i${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: "image/jpeg" });
  return f?.id ?? "";
}
async function seedStay(status: typeof stay.$inferInsert.status = "reserved", org: SeedOrg = env.base) {
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
      checkInDate: "2026-10-04",
      checkOutDate: "2026-10-07",
      nights: 3,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 180_000,
      status,
      checkedInAt: status === "checked_in" ? new Date("2026-10-04T03:00:00Z") : null,
    })
    .returning();
  return s?.id ?? "";
}
const body = (over: Partial<StaysSaveIntakeRequest> = {}): StaysSaveIntakeRequest => ({
  feedingTimes: ["08:00", "18:00"],
  foodProvidedByOwner: true,
  walksPerDay: 1,
  emergencyContactName: "แม่",
  emergencyContactPhone: "081-234-5678",
  complete: false,
  ...over,
});
const save = (stayId: string, input: StaysSaveIntakeRequest, role: "owner" | "front_desk" = "front_desk") =>
  staysSaveIntake(staffCtx(env.base, role), { ...input, stayId });
const medsOf = (stayId: string) => env.db.select().from(stayMedication).where(eq(stayMedication.stayId, stayId));

it("saves the form (R-22 phone), photos committed, medications and belongings, complete sets completed_at", async () => {
  const id = await seedStay();
  const photo = await upload();
  const blanket = await upload();
  const res = StaysSaveIntakeResponse.parse(
    await save(id, {
      ...body(),
      foodBrand: "Royal Canin",
      foodAmount: "1 ถ้วย",
      conditionNote: "มีแผลที่ขา",
      conditionPhotoIds: [photo],
      vetClinicName: "คลินิกใกล้บ้าน",
      vetClinicPhone: "02-123-4567",
      medications: [{ name: "ยาหยอดหู", dose: "2 หยด", times: ["09:00", "21:00"], instructions: "หลังอาหาร" }],
      belongings: [{ item: "ผ้าห่ม", quantity: 1, photoFileId: blanket }],
      complete: true,
    }),
  );
  expect(res.intake).toMatchObject({
    foodBrand: "Royal Canin",
    feedingTimes: ["08:00", "18:00"],
    walksPerDay: 1,
    completedAt: TEST_NOW.toISOString(),
  });
  expect(res.intake?.conditionPhotoUrls).toHaveLength(1);
  expect(res.stay.intakeCompleted).toBe(true);
  const [row] = await env.db.select().from(stayIntake).where(eq(stayIntake.stayId, id));
  expect(row).toMatchObject({
    emergencyContactName: "แม่",
    emergencyContactPhone: "+66812345678",
    vetClinicPhone: "02-123-4567",
    conditionPhotoIds: [photo],
    completedBy: env.base.staff.front_desk,
  });
  expect((await medsOf(id)).map((m) => [m.name, m.dose, m.times.map((t) => t.slice(0, 5)), m.instructions])).toEqual([
    ["ยาหยอดหู", "2 หยด", ["09:00", "21:00"], "หลังอาหาร"],
  ]);
  expect(res.belongings).toEqual([expect.objectContaining({ item: "ผ้าห่ม", quantity: 1, photoUrl: expect.any(String) })]);
  for (const f of [photo, blanket])
    expect((await env.db.select().from(fileObject).where(eq(fileObject.id, f)))[0]?.committedAt).not.toBeNull();
  // a reserved stay has no care tasks yet
  expect(await env.db.select().from(careTask).where(eq(careTask.stayId, id))).toEqual([]);
});

it("saving again updates the row, keeps an unchanged medication's id, replaces the others and the belongings", async () => {
  const id = await seedStay();
  const ear = { name: "ยาหยอดหู", dose: "2 หยด", times: ["09:00"] };
  await save(
    id,
    body({ medications: [ear, { name: "ยาถ่าย", dose: "1 เม็ด", times: ["08:00"] }], belongings: [{ item: "ตุ๊กตา", quantity: 2 }] }),
  );
  const before = (await medsOf(id)).find((m) => m.name === "ยาหยอดหู")?.id;
  await save(id, body({ walksPerDay: 3, medications: [ear], belongings: [{ item: "ผ้าห่ม", quantity: 1 }] }));
  const meds = await medsOf(id);
  expect(meds.map((m) => [m.id, m.name])).toEqual([[before, "ยาหยอดหู"]]);
  expect((await env.db.select().from(stayBelonging).where(eq(stayBelonging.stayId, id))).map((b) => b.item)).toEqual(["ผ้าห่ม"]);
  expect((await env.db.select().from(stayIntake).where(eq(stayIntake.stayId, id)))[0]).toMatchObject({ walksPerDay: 3, completedAt: null });
});

it("checked in: future pending tasks are rebuilt from the new form, past and done tasks stay", async () => {
  const id = await seedStay("checked_in");
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db.insert(careTask).values([
    { ...tenant, stayId: id, taskType: "feed", title: "ให้อาหาร", dueAt: new Date("2026-10-05T01:00:00Z"), status: "done" },
    { ...tenant, stayId: id, taskType: "feed", title: "ให้อาหาร", dueAt: new Date("2026-10-06T01:00:00Z") },
  ]);
  await save(id, body({ feedingTimes: ["07:00"], walksPerDay: 0, medications: [{ name: "ยาหยอดหู", dose: "2 หยด", times: ["20:00"] }] }));
  const tasks = await env.db.select().from(careTask).where(eq(careTask.stayId, id));
  expect(tasks.find((t) => t.status === "done")?.dueAt.toISOString()).toBe("2026-10-05T01:00:00.000Z");
  expect(tasks.some((t) => t.dueAt.toISOString() === "2026-10-06T01:00:00.000Z")).toBe(false);
  const future = tasks.filter((t) => t.status === "pending");
  expect(future.every((t) => t.dueAt > TEST_NOW)).toBe(true);
  // 07:00 Bangkok = 00:00Z; medication at 20:00 = 13:00Z
  expect(future.some((t) => t.taskType === "feed" && t.dueAt.toISOString() === "2026-10-06T00:00:00.000Z")).toBe(true);
  expect(future.some((t) => t.taskType === "medication" && t.dueAt.toISOString() === "2026-10-05T13:00:00.000Z")).toBe(true);
  expect(future.some((t) => t.taskType === "walk")).toBe(false);
});

it("a bad emergency phone → INVALID_PHONE; a photo of another kind → VALIDATION_FAILED; finished stay → STATUS_NOT_ALLOWED", async () => {
  const id = await seedStay();
  await expect(save(id, body({ emergencyContactPhone: "12345" }))).rejects.toMatchObject({ code: "INVALID_PHONE" });
  await expect(save(id, body({ conditionPhotoIds: [await upload("slip")] }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await env.db.select().from(stayIntake).where(eq(stayIntake.stayId, id))).toEqual([]);
  for (const status of ["checked_out", "cancelled"] as const)
    await expect(save(await seedStay(status), body())).rejects.toMatchObject({ code: "STATUS_NOT_ALLOWED" });
});

async function put(id: string, input: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/intake`, {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it.each([
  ["missing complete", { ...body(), complete: undefined }],
  ["seven feeding times", body({ feedingTimes: ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00"] })],
  ["seven walks", body({ walksPerDay: 7 })],
  ["medication without times", body({ medications: [{ name: "ยา", dose: "1", times: [] }] })],
  ["missing emergency contact", { ...body(), emergencyContactName: undefined }],
])("VALIDATION_FAILED: %s", async (_n, input) => {
  expect(await codeOf(await put(await seedStay(), input))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's stay → NOT_FOUND", async () => {
  expect(await codeOf(await put(await seedStay(), body(), "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await put(await seedStay("reserved", other), body()))).toBe("NOT_FOUND");
});
