// T-0173 liff.createPet: the customer adds a pet; it gets this shop's profile and a customer-sourced weight.
import { LiffCreatePetParams, LiffCreatePetRequest, LiffCreatePetResponse } from "@app/contracts/endpoints/liff.createPet";
import { pet, petShopProfile, petWeight } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffCreatePet } from "../../../src/services/liff/createPet.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withCustomer("liff.createPet", { params: LiffCreatePetParams, body: LiffCreatePetRequest }, liffCreatePet);
const call = async (slug: string, s: SeedOrg, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pets`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const valid = { name: "โมจิ", species: "dog", sex: "female", coatType: "curly" };

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("creates the pet for the customer's owner profile with a shop profile and a customer weight", async () => {
  const s = await seedOrg(env.db, "cp1");
  const res = await call("shop-cp1", s, {
    ...valid,
    breed: "พุดเดิ้ล",
    birthDate: "2024-02-01",
    neutered: true,
    weightGrams: 4200,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffCreatePetResponse;
  expect(LiffCreatePetResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    name: "โมจิ",
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    birthDate: "2024-02-01",
    neutered: true,
    coatType: "curly",
    latestWeightGrams: 4200,
    photoUrl: null,
    sharedNote: null,
    vaccinations: [],
    photos: [],
  });
  const [row] = await env.db.select().from(pet).where(eq(pet.id, body.id));
  expect(row).toMatchObject({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, latestWeightGrams: 4200 });
  expect(await env.db.select().from(petShopProfile).where(eq(petShopProfile.petId, body.id))).toMatchObject([{ organizationId: s.orgId }]);
  expect(await env.db.select().from(petWeight).where(eq(petWeight.petId, body.id))).toMatchObject([
    { organizationId: s.orgId, weightGrams: 4200, source: "customer", recordedBy: null },
  ]);
});

it("missing / invalid fields, species other (no species_other in LIFF) → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "cp2");
  const { sex: _sex, ...noSex } = valid;
  const { coatType: _coat, ...noCoat } = valid;
  for (const body of [
    noSex,
    noCoat,
    { ...valid, name: "" },
    { ...valid, birthDate: "2099-01-01" },
    { ...valid, weightGrams: 0 },
    { ...valid, internalNote: "x" },
    { ...valid, species: "other" },
  ])
    expect(await errorCode(await call("shop-cp2", s, body))).toBe("VALIDATION_FAILED");
});

it("another shop's session → UNAUTHENTICATED; unknown shop → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "cp3");
  await seedOrg(env.db, "cp4");
  expect(await errorCode(await call("shop-cp4", s, valid))).toBe("UNAUTHENTICATED");
  expect(await errorCode(await call("no-such-shop", s, valid))).toBe("NOT_FOUND");
});
