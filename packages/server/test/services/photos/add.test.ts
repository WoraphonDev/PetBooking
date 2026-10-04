import { PhotosAddRequest, PhotosAddResponse } from "@app/contracts/endpoints/photos.add";
import { PhotosListRequest } from "@app/contracts/endpoints/photos.list";
import { fileObject, pet, petPhoto } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { photosAdd } from "../../../src/services/photos/add.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let petId: string;
let fileId: string;
let foreignFileId: string;
const storage = createFakeStorage();
beforeAll(async () => {
  env = await setupTestDb();
  setStorage(storage);
  foreign = await otherOrg(env.db);
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Pet", species: "dog" })
    .returning();
  petId = p!.id;
  const rows = await env.db
    .insert(fileObject)
    .values([
      {
        organizationId: env.base.orgId,
        kind: "before",
        storageKey: "before.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "staff",
      },
      {
        organizationId: foreign.orgId,
        kind: "before",
        storageKey: "foreign.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "staff",
      },
    ])
    .returning();
  fileId = rows[0]!.id;
  foreignFileId = rows[1]!.id;
  storage.put("before.jpg", { sizeBytes: 10, contentType: "image/jpeg" });
});
afterAll(async () => {
  setStorage(null);
  await env.close();
});
const input = () => PhotosAddRequest.parse({ fileId, kind: "before", caption: "Before grooming" });
it.each(["owner", "front_desk", "staff"] as const)("adds and commits a photo as %s", async (role) => {
  const result = PhotosAddResponse.parse(await photosAdd(staffCtx(env.base, role), { ...input(), petId }));
  expect(result).toMatchObject({
    kind: "before",
    caption: "Before grooming",
    takenAt: TEST_NOW.toISOString(),
    appointmentId: null,
    stayId: null,
  });
  expect(result.url).toContain("before.jpg?op=get");
  const [row] = await env.db.select().from(petPhoto).where(eq(petPhoto.id, result.id));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    petId,
    fileId,
    uploadedBy: env.base.staff[role],
    takenAt: TEST_NOW,
    createdAt: TEST_NOW,
  });
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, fileId));
  expect(file!.committedAt).toEqual(TEST_NOW);
});
it("returns VALIDATION_FAILED for malformed body fields through HTTP", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const POST = withStaff("photos.add", { body: PhotosAddRequest, params: PhotosListRequest }, photosAdd);
  resetRateLimits();
  for (const body of [
    {},
    { fileId, kind: "invalid" },
    { fileId: "bad", kind: "before" },
    { ...input(), caption: "x".repeat(201) },
    { ...input(), stayId: "bad" },
  ]) {
    const response = await POST(
      new Request("https://petbooking.test/api/v1/staff/pets/" + petId + "/photos", {
        method: "POST",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
      { params: { petId } },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
it("denies non-staff actors", async () => {
  await expect(photosAdd(customerCtx(env.base), { ...input(), petId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects foreign files and inaccessible pets without writing", async () => {
  const before = (await env.db.select().from(petPhoto)).length;
  await expect(photosAdd(staffCtx(env.base, "owner"), { ...input(), petId, fileId: foreignFileId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  // A tenant without a customer relationship to this pet cannot access it.
  const ctx = staffCtx(foreign, "owner");
  await expect(photosAdd(ctx, { ...input(), petId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await env.db.select().from(petPhoto)).length).toBe(before);
});
it("rolls back file commitment if response signing fails", async () => {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "before",
      storageKey: "rollback.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  storage.put("rollback.jpg", { sizeBytes: 10, contentType: "image/jpeg" });
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  await expect(photosAdd(staffCtx(env.base, "owner"), { ...input(), petId, fileId: f!.id })).rejects.toThrow("signing failed");
  setStorage(storage);
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f!.id));
  expect(file!.committedAt).toBeNull();
  expect(await env.db.select().from(petPhoto).where(eq(petPhoto.fileId, f!.id))).toHaveLength(0);
});
