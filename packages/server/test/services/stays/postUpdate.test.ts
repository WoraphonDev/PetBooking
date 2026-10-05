import { StaysPostUpdateParams, StaysPostUpdateRequest, StaysPostUpdateResponse } from "@app/contracts/endpoints/stays.postUpdate";
import { booking, fileObject, notification, pet, petPhoto, roomType, roomUnit, stay } from "@app/db/schema";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { staysPostUpdate } from "../../../src/services/stays/postUpdate.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.postUpdate", { body: StaysPostUpdateRequest, params: StaysPostUpdateParams }, staysPostUpdate);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;

async function upload(kind: typeof fileObject.$inferInsert.kind = "stay_update", org: SeedOrg = env.base) {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind,
      storageKey: `org/x/${kind}/u${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedByType: "staff",
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
      checkInDate: "2026-10-04",
      checkOutDate: "2026-10-07",
      nights: 3,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 180_000,
      status: "checked_in",
    })
    .returning();
  return { id: s?.id ?? "", petId: p?.id ?? "", petName: p?.name ?? "" };
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
const notesOf = (stayId: string) =>
  env.db
    .select()
    .from(notification)
    .where(like(notification.dedupeKey, `stay_update:${stayId}:%`));

it("adds stay photos with the caption, commits the files and tells the customer once per local day (role staff)", async () => {
  const s = await seedStay();
  const files = [await upload(), await upload()];
  const res = StaysPostUpdateResponse.parse(
    await staysPostUpdate(staffCtx(env.base, "staff"), { stayId: s.id, fileIds: files, caption: "กินข้าวเก่ง", notifyCustomer: true }),
  );
  expect(res.updates.map((u) => [u.kind, u.caption, u.stayId])).toEqual([
    ["stay", "กินข้าวเก่ง", s.id],
    ["stay", "กินข้าวเก่ง", s.id],
  ]);
  const photos = await env.db.select().from(petPhoto).where(eq(petPhoto.stayId, s.id));
  expect(photos.map((p) => p.fileId).sort()).toEqual([...files].sort());
  expect(
    photos.every((p) => p.petId === s.petId && p.uploadedBy === env.base.staff.staff && p.takenAt.getTime() === TEST_NOW.getTime()),
  ).toBe(true);
  const committed = await env.db
    .select()
    .from(fileObject)
    .where(eq(fileObject.id, files[0] ?? ""));
  expect(committed[0]?.committedAt).not.toBeNull();

  const notes = await notesOf(s.id);
  expect(notes).toHaveLength(1);
  // TEST_NOW 03:00Z = 10:00 in Bangkok on 2026-10-05
  expect(notes[0]).toMatchObject({
    templateKey: "customer.stay_update",
    recipientId: env.base.customerId,
    dedupeKey: `stay_update:${s.id}:2026-10-05:${env.base.customerId}`,
    payload: { petName: s.petName, updatesUrl: expect.stringMatching(new RegExp(`/liff/[^/]+/stays/${s.id}$`)) },
  });

  // a second update the same day adds photos but no second message
  await staysPostUpdate(staffCtx(env.base, "front_desk"), { stayId: s.id, fileIds: [await upload()], notifyCustomer: true });
  expect(await env.db.select().from(petPhoto).where(eq(petPhoto.stayId, s.id))).toHaveLength(3);
  expect(await notesOf(s.id)).toHaveLength(1);
});

it("notifyCustomer false: photos only", async () => {
  const s = await seedStay();
  await staysPostUpdate(staffCtx(env.base, "owner"), { stayId: s.id, fileIds: [await upload()], notifyCustomer: false });
  expect(await env.db.select().from(petPhoto).where(eq(petPhoto.stayId, s.id))).toHaveLength(1);
  expect(await notesOf(s.id)).toEqual([]);
});

it("a file of another kind or a repeated file → VALIDATION_FAILED, nothing saved", async () => {
  const s = await seedStay();
  await expect(
    staysPostUpdate(staffCtx(env.base, "staff"), { stayId: s.id, fileIds: [await upload(), await upload("slip")], notifyCustomer: true }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  const f = await upload();
  await expect(staysPostUpdate(staffCtx(env.base, "staff"), { stayId: s.id, fileIds: [f, f], notifyCustomer: true })).rejects.toMatchObject(
    {
      code: "VALIDATION_FAILED",
    },
  );
  expect(await env.db.select().from(petPhoto).where(eq(petPhoto.stayId, s.id))).toEqual([]);
  expect(await notesOf(s.id)).toEqual([]);
});

async function post(id: string, body: unknown) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.staff, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/updates`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it.each([
  ["no files", { fileIds: [] }],
  ["seven files", { fileIds: Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`) }],
  ["caption over 200", { fileIds: ["00000000-0000-4000-8000-000000000001"], caption: "ก".repeat(201) }],
  ["not a uuid", { fileIds: ["x"] }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await post((await seedStay()).id, body))).toBe("VALIDATION_FAILED");
});

it("another org's stay → NOT_FOUND", async () => {
  expect(await codeOf(await post((await seedStay(other)).id, { fileIds: [await upload()] }))).toBe("NOT_FOUND");
});
