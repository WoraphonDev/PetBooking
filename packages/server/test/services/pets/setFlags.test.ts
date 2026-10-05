import { PetsSetFlagsParams, PetsSetFlagsRequest, PetsSetFlagsResponse } from "@app/contracts/endpoints/pets.setFlags";
import { pet, petShopProfile, petTemperamentFlag } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsSetFlags } from "../../../src/services/pets/setFlags.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("pets.setFlags", { body: PetsSetFlagsRequest, params: PetsSetFlagsParams }, petsSetFlags);
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
const put = (petId: string, body: unknown, role?: "owner" | "front_desk" | "staff") => call("PUT", "temperament-flags", petId, body, role);
const flagsOf = async (petId: string, org = env.base.orgId) =>
  (
    await env.db
      .select()
      .from(petTemperamentFlag)
      .where(and(eq(petTemperamentFlag.petId, petId), eq(petTemperamentFlag.organizationId, org)))
  )
    .map((f) => [f.flag, f.note])
    .sort();

it("replaces this shop's whole set (role staff); another shop's flags stay", async () => {
  const id = await seedPet(env.base, true);
  await env.db.insert(petTemperamentFlag).values([
    { organizationId: env.base.orgId, petId: id, flag: "bites" },
    { organizationId: other.orgId, petId: id, flag: "anxious" },
  ]);
  const res = await put(id, { flags: [{ flag: "needs_muzzle" }, { flag: "other", note: "ไม่ชอบเสียงไดร์" }] });
  expect(res.status).toBe(200);
  const d = PetsSetFlagsResponse.parse(await res.json());
  expect(d.flags.map((f) => f.flag).sort()).toEqual(["needs_muzzle", "other"]);
  expect(await flagsOf(id)).toEqual([
    ["needs_muzzle", null],
    ["other", "ไม่ชอบเสียงไดร์"],
  ]);
  expect(await flagsOf(id, other.orgId)).toEqual([["anxious", null]]);
  await put(id, { flags: [] }, "owner");
  expect(await flagsOf(id)).toEqual([]);
});

it.each([
  ["a flag twice", { flags: [{ flag: "bites" }, { flag: "bites" }] }],
  ["other without note", { flags: [{ flag: "other" }] }],
  ["unknown flag", { flags: [{ flag: "sleepy" }] }],
  ["missing flags", {}],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await put(await seedPet(), body))).toBe("VALIDATION_FAILED");
});

it("another org's pet → NOT_FOUND", async () => {
  expect(await codeOf(await put(await seedPet(other), { flags: [] }))).toBe("NOT_FOUND");
  void pet;
});
