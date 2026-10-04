import { PetsGetRequest, PetsGetResponse } from "@app/contracts/endpoints/pets.get";
import {
  booking,
  fileObject,
  groomAppointment,
  groomStation,
  pet,
  petPhoto,
  petShopProfile,
  petTemperamentFlag,
  petVaccination,
  petWeight,
  vaccineType,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsGet } from "../../../src/services/pets/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let petId: string;
let foreignId: string;
let missingShopId: string;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const rows = await env.db
    .insert(pet)
    .values(
      [env.base, foreign, env.base].map((base, i) => ({
        ownerProfileId: base.ownerProfileId,
        createdInOrgId: base.orgId,
        name: `Pet ${i}`,
        species: "dog" as const,
      })),
    )
    .returning();
  [petId, foreignId, missingShopId] = rows.map((p) => p.id) as [string, string, string];
  await env.db.insert(petShopProfile).values([
    { organizationId: env.base.orgId, petId, internalNote: "Own note" },
    { organizationId: foreign.orgId, petId, internalNote: "Private foreign note" },
    { organizationId: foreign.orgId, petId: foreignId },
  ]);
  await env.db.insert(petTemperamentFlag).values([
    { organizationId: env.base.orgId, petId, flag: "anxious", note: "Gentle" },
    { organizationId: foreign.orgId, petId, flag: "bites", note: "Foreign" },
  ]);
  await env.db.insert(petWeight).values([
    { organizationId: env.base.orgId, petId, weightGrams: 4000, measuredAt: TEST_NOW },
    { organizationId: foreign.orgId, petId, weightGrams: 9000 },
  ]);
});
afterAll(async () => {
  await env.close();
});
it.each(["owner", "front_desk", "staff"] as const)("%s gets shared fields with only own shop history", async (role) => {
  const result = PetsGetResponse.parse(await petsGet(staffCtx(env.base, role), { petId }));
  expect(result).toMatchObject({
    id: petId,
    name: "Pet 0",
    ownerProfileId: env.base.ownerProfileId,
    shop: { internalNote: "Own note" },
    flags: [{ flag: "anxious", note: "Gentle" }],
    weights: [{ weightGrams: 4000, measuredAt: TEST_NOW.toISOString(), source: "shop" }],
    vaccinations: [],
    nextGroomDue: null,
  });
  expect(result).not.toHaveProperty("createdInOrgId");
});
it("hides foreign pets and requires an own shop profile", async () => {
  for (const id of [foreignId, missingShopId])
    await expect(petsGet(staffCtx(env.base, "owner"), { petId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("returns vaccination/proof, favorite-style photos and the R-17 due date", async () => {
  const storage = createFakeStorage();
  setStorage(storage);
  const [file] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "before",
      storageKey: "favorite.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!file) throw new Error("file fixture");
  const [photo] = await env.db
    .insert(petPhoto)
    .values({ organizationId: env.base.orgId, petId, fileId: file.id, kind: "before" })
    .returning();
  if (!photo) throw new Error("photo fixture");
  await env.db
    .update(petShopProfile)
    .set({ favoriteStylePhotoId: photo.id, groomIntervalDays: 30, lastGroomedAt: new Date("2026-09-01T03:00:00Z") })
    .where(eq(petShopProfile.petId, petId));
  const [vaccine] = await env.db.select().from(vaccineType);
  if (!vaccine) throw new Error("vaccine fixture");
  const [proof] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "vaccine_proof",
      storageKey: "vaccine.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
      committedAt: TEST_NOW,
    })
    .returning();
  if (!proof) throw new Error("proof fixture");
  await env.db.insert(petVaccination).values({
    petId,
    vaccineCode: vaccine.code,
    administeredOn: "2026-01-01",
    expiresOn: "2027-01-01",
    status: "verified",
    source: "shop",
    proofFileId: proof.id,
  });
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      bookingNo: "TEST-DUE-1",
      channel: "walk_in",
      createdByType: "staff",
      policySnapshot: {},
      status: "closed",
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  const startsAt = new Date("2026-09-01T03:00:00Z"),
    endsAt = new Date("2026-09-01T04:00:00Z");
  const [station] = await env.db
    .insert(groomStation)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, name: "Test station" })
    .returning();
  if (!station) throw new Error("station fixture");
  await env.db.insert(groomAppointment).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    bookingId: bk.id,
    groomerId: env.base.staff.staff,
    stationId: station.id,
    petId,
    startsAt,
    endsAt,
    blockedUntil: endsAt,
    status: "done",
  });
  const result = await petsGet(staffCtx(env.base, "owner"), { petId });
  expect(result).toMatchObject({
    shop: { favoriteStylePhotoUrl: expect.stringContaining("favorite.jpg?op=get"), lastGroomedAt: "2026-09-01T03:00:00.000Z" },
    nextGroomDue: "2026-10-01",
  });
  expect(result.vaccinations).toEqual([
    expect.objectContaining({
      vaccineCode: vaccine.code,
      vaccineName: vaccine.nameTh,
      administeredOn: "2026-01-01",
      expiresOn: "2027-01-01",
      status: "verified",
      source: "shop",
      proofUrl: expect.stringContaining("vaccine.jpg?op=get"),
      rejectReason: null,
    }),
  ]);
  setStorage(null);
});
it("returns HTTP VALIDATION_FAILED for a malformed pet id", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const GET = withStaff("pets.get", { params: PetsGetRequest }, petsGet);
  const response = await GET(new Request("https://petbooking.test/api/v1/staff/pets/bad", { headers: { cookie: `sid=${login.token}` } }), {
    params: { petId: "bad" },
  });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
