import { PetsAddWeightParams, PetsAddWeightRequest, PetsAddWeightResponse } from "@app/contracts/endpoints/pets.addWeight";
import { pet, petShopProfile, petWeight } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsAddWeight } from "../../../src/services/pets/addWeight.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("pets.addWeight", { body: PetsAddWeightRequest, params: PetsAddWeightParams }, petsAddWeight);
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
/** a pet with this shop's profile (and optionally another shop's profile too) */
async function seedPet(org: SeedOrg = env.base, alsoOther = false) {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: org.orgId, petId: p?.id ?? "" });
  if (alsoOther) await env.db.insert(petShopProfile).values({ organizationId: other.orgId, petId: p?.id ?? "" });
  return p?.id ?? "";
}
async function call(method: string, url: string, petId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "staff") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/pets/${petId}/${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { petId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const post = (petId: string, body: unknown, role?: "owner" | "front_desk" | "staff") => call("POST", "weights", petId, body, role);
const latest = async (petId: string) => (await env.db.select().from(pet).where(eq(pet.id, petId)))[0]?.latestWeightGrams;

it("records a shop weight now and makes it the latest weight (role staff)", async () => {
  const id = await seedPet();
  const res = await post(id, { weightGrams: 5200 });
  expect(res.status).toBe(200);
  const d = PetsAddWeightResponse.parse(await res.json());
  expect(d.latestWeightGrams).toBe(5200);
  const [w] = await env.db.select().from(petWeight).where(eq(petWeight.petId, id));
  expect(w).toMatchObject({ organizationId: env.base.orgId, weightGrams: 5200, source: "shop", recordedBy: env.base.staff.staff });
  expect(await latest(id)).toBe(5200);
});

it("an older measurement is stored but does not replace the latest weight", async () => {
  const id = await seedPet();
  await post(id, { weightGrams: 5200, measuredAt: "2026-10-01T03:00:00.000Z" });
  await post(id, { weightGrams: 4800, measuredAt: "2026-09-01T03:00:00.000Z" });
  expect(await latest(id)).toBe(5200);
  expect(await env.db.select().from(petWeight).where(eq(petWeight.petId, id))).toHaveLength(2);
  await post(id, { weightGrams: 5400, measuredAt: "2026-10-02T03:00:00.000Z" });
  expect(await latest(id)).toBe(5400);
  void and;
});

it.each([
  ["missing weight", {}],
  ["below 100 g", { weightGrams: 99 }],
  ["over 150 kg", { weightGrams: 150_001 }],
  ["bad time", { weightGrams: 5000, measuredAt: "yesterday" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await post(await seedPet(), body))).toBe("VALIDATION_FAILED");
});

it("another org's pet → NOT_FOUND", async () => {
  expect(await codeOf(await post(await seedPet(other), { weightGrams: 5000 }))).toBe("NOT_FOUND");
});
