import { PetsUpdateParams, PetsUpdateRequest, PetsUpdateResponse } from "@app/contracts/endpoints/pets.update";
import { fileObject, pet, petShopProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsUpdate } from "../../../src/services/pets/update.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let petId: string;
let foreignId: string;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const rows = await env.db
    .insert(pet)
    .values(
      [env.base, foreign].map((base) => ({
        ownerProfileId: base.ownerProfileId,
        createdInOrgId: base.orgId,
        name: "Dog",
        species: "dog" as const,
      })),
    )
    .returning();
  [petId, foreignId] = rows.map((p) => p.id) as [string, string];
  await env.db.insert(petShopProfile).values([
    { organizationId: env.base.orgId, petId },
    { organizationId: foreign.orgId, petId: foreignId },
  ]);
});
afterAll(async () => {
  await env.close();
});
it.each(["owner", "front_desk"] as const)("%s updates all mutable fields and ctx.now", async (role) => {
  const body = PetsUpdateRequest.parse({
    name: "Rabbit",
    species: "other",
    speciesOther: "Rabbit",
    breed: "Lop",
    sex: "female",
    birthDate: "2020-01-01",
    ageEstimateMonths: 50,
    neutered: false,
    color: "White",
    microchipNo: "123456789012345",
    coatType: "long",
  });
  const result = PetsUpdateResponse.parse(await petsUpdate(staffCtx(env.base, role), { ...body, petId }));
  expect(result).toMatchObject(body);
  const [row] = await env.db.select().from(pet).where(eq(pet.id, petId));
  expect(row).toMatchObject({ ...body, updatedAt: TEST_NOW });
});
it("denies staff and other organizations", async () => {
  await expect(petsUpdate(staffCtx(env.base, "staff"), { petId, name: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(petsUpdate(staffCtx(env.base, "owner"), { petId: foreignId, name: "No" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rejects weight updates, future birthdays and incomplete species changes", async () => {
  expect(PetsUpdateRequest.safeParse({ weightGrams: 4000 }).success).toBe(false);
  await expect(petsUpdate(staffCtx(env.base, "owner"), { petId, birthDate: "2026-10-06" })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  await expect(petsUpdate(staffCtx(env.base, "owner"), { petId, species: "other", speciesOther: "" })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});

it("rolls back an updated pet and profile commitment when signing fails", async () => {
  const storage = createFakeStorage();
  setStorage(storage);
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "pet_profile",
      storageKey: "update-pet.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("file fixture");
  storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
  const [before] = await env.db.select().from(pet).where(eq(pet.id, petId));
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  try {
    await expect(petsUpdate(staffCtx(env.base, "owner"), { petId, profileFileId: f.id, name: "Rollback" })).rejects.toThrow(
      "signing failed",
    );
  } finally {
    setStorage(storage);
  }
  const [after] = await env.db.select().from(pet).where(eq(pet.id, petId));
  expect(after).toEqual(before);
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toBeNull();
  const result = await petsUpdate(staffCtx(env.base, "owner"), { petId, profileFileId: f.id });
  expect(result.photoUrl).toContain("update-pet.jpg?op=get");
  setStorage(null);
});
it("returns HTTP VALIDATION_FAILED for malformed updates", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const PATCH = withStaff("pets.update", { params: PetsUpdateParams, body: PetsUpdateRequest }, petsUpdate);
  for (const body of [{ weightGrams: 4000 }, { name: "" }, { microchipNo: "bad" }, { birthDate: "2020-02-31" }]) {
    const response = await PATCH(
      new Request(`https://petbooking.test/api/v1/staff/pets/${petId}`, {
        method: "PATCH",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
      { params: { petId } },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
