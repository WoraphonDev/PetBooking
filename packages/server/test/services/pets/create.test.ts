import { PetsCreateParams, PetsCreateRequest, PetsCreateResponse } from "@app/contracts/endpoints/pets.create";
import { fileObject, pet, petShopProfile, petWeight } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsCreate } from "../../../src/services/pets/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  await env.close();
});
const body = {
  name: "Milo",
  species: "dog",
  breed: "Poodle",
  sex: "male",
  birthDate: "2020-01-02",
  ageEstimateMonths: 70,
  neutered: true,
  color: "Brown",
  microchipNo: "123456789012345",
  coatType: "curly",
  weightGrams: 4000,
} as const;
it.each(["owner", "front_desk"] as const)("%s creates pet, empty shop profile and first weight atomically", async (role) => {
  const result = PetsCreateResponse.parse(
    await petsCreate(staffCtx(env.base, role), { ...PetsCreateRequest.parse(body), customerId: env.base.customerId }),
  );
  const { weightGrams, ...fields } = body;
  expect(result).toMatchObject({
    ...fields,
    ownerProfileId: env.base.ownerProfileId,
    latestWeightGrams: weightGrams,
    flags: [],
    vaccinations: [],
    photoUrl: null,
    nextGroomDue: null,
  });
  expect(result.weights).toEqual([{ weightGrams, measuredAt: TEST_NOW.toISOString(), source: "shop" }]);
  const [row] = await env.db.select().from(pet).where(eq(pet.id, result.id));
  expect(row).toMatchObject({
    ...fields,
    createdInOrgId: env.base.orgId,
    latestWeightGrams: weightGrams,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  const [shop] = await env.db.select().from(petShopProfile).where(eq(petShopProfile.petId, result.id));
  expect(shop).toMatchObject({ organizationId: env.base.orgId, internalNote: null, preferredStyle: null, createdAt: TEST_NOW });
  const [weight] = await env.db.select().from(petWeight).where(eq(petWeight.petId, result.id));
  expect(weight).toMatchObject({ organizationId: env.base.orgId, recordedBy: env.base.staff[role], measuredAt: TEST_NOW });
});
it("denies staff and a foreign customer", async () => {
  const input = { ...PetsCreateRequest.parse(body), customerId: env.base.customerId };
  await expect(petsCreate(staffCtx(env.base, "staff"), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(petsCreate(staffCtx(env.base, "owner"), { ...input, customerId: foreign.customerId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("validates each constrained field and future birth dates", async () => {
  for (const change of [
    { name: "" },
    { species: "other" },
    { breed: "x".repeat(61) },
    { ageEstimateMonths: 361 },
    { microchipNo: "123" },
    { weightGrams: 99 },
    { weightGrams: 150001 },
    { weightGrams: 1.5 },
  ])
    expect(PetsCreateRequest.safeParse({ ...body, ...change }).success).toBe(false);
  await expect(
    petsCreate(staffCtx(env.base, "owner"), {
      ...PetsCreateRequest.parse({ ...body, birthDate: "2026-10-06" }),
      customerId: env.base.customerId,
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});
it("allows other species with a description and omits the optional weight", async () => {
  const result = await petsCreate(staffCtx(env.base, "owner"), {
    ...PetsCreateRequest.parse({ name: "Rabbit", species: "other", speciesOther: "Rabbit", coatType: "short" }),
    customerId: env.base.customerId,
  });
  expect(result).toMatchObject({ species: "other", speciesOther: "Rabbit", sex: "unknown", latestWeightGrams: null, weights: [] });
});

it("signs and commits the profile file, and rolls back all creation when signing fails", async () => {
  const storage = createFakeStorage();
  setStorage(storage);
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "pet_profile",
      storageKey: "create-pet.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("file fixture");
  storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
  const input = { ...PetsCreateRequest.parse(body), customerId: env.base.customerId, profileFileId: f.id };
  const counts = await Promise.all([env.db.select().from(pet), env.db.select().from(petShopProfile), env.db.select().from(petWeight)]);
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  try {
    await expect(petsCreate(staffCtx(env.base, "owner"), input)).rejects.toThrow("signing failed");
  } finally {
    setStorage(storage);
  }
  const after = await Promise.all([env.db.select().from(pet), env.db.select().from(petShopProfile), env.db.select().from(petWeight)]);
  expect(after.map((rows) => rows.length)).toEqual(counts.map((rows) => rows.length));
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toBeNull();
  const result = await petsCreate(staffCtx(env.base, "owner"), input);
  expect(result.photoUrl).toContain("create-pet.jpg?op=get");
  const [bound] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(bound?.committedAt).toEqual(TEST_NOW);
  setStorage(null);
});
it("rejects foreign files, wrong file kind and missing uploaded bytes", async () => {
  const storage = createFakeStorage();
  setStorage(storage);
  for (const [orgId, kind, uploaded, code] of [
    [foreign.orgId, "pet_profile", true, "NOT_FOUND"],
    [env.base.orgId, "logo", true, "VALIDATION_FAILED"],
    [env.base.orgId, "pet_profile", false, "FILE_NOT_UPLOADED"],
  ] as const) {
    const [f] = await env.db
      .insert(fileObject)
      .values({
        organizationId: orgId,
        kind,
        storageKey: crypto.randomUUID() + ".jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "staff",
      })
      .returning();
    if (!f) throw new Error("file fixture");
    if (uploaded) storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
    await expect(
      petsCreate(staffCtx(env.base, "owner"), { ...PetsCreateRequest.parse(body), customerId: env.base.customerId, profileFileId: f.id }),
    ).rejects.toMatchObject({ code });
    expect(await env.db.select().from(pet).where(eq(pet.profileFileId, f.id))).toHaveLength(0);
  }
  setStorage(null);
});
it("returns HTTP VALIDATION_FAILED for malformed or missing fields", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const POST = withStaff("pets.create", { params: PetsCreateParams, body: PetsCreateRequest }, petsCreate);
  for (const body of [
    {},
    { name: "Bad", species: "other", coatType: "short" },
    { name: "Bad", species: "dog", coatType: "short", birthDate: "2020-02-31" },
  ]) {
    const response = await POST(
      new Request(`https://petbooking.test/api/v1/staff/customers/${env.base.customerId}/pets`, {
        method: "POST",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
      { params: { customerId: env.base.customerId } },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
