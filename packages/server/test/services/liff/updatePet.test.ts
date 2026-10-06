// T-0173 liff.updatePet: the customer edits their own pet known to this shop.
import { LiffUpdatePetParams, LiffUpdatePetRequest, LiffUpdatePetResponse } from "@app/contracts/endpoints/liff.updatePet";
import { ownerProfile, pet, petShopProfile, petWeight } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffUpdatePet } from "../../../src/services/liff/updatePet.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const PATCH = withCustomer("liff.updatePet", { params: LiffUpdatePetParams, body: LiffUpdatePetRequest }, liffUpdatePet);
const call = async (slug: string, s: SeedOrg, petId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return PATCH(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pets/${petId}`, {
      method: "PATCH",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug, petId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function addPet(ownerProfileId: string, orgId: string, extra: Partial<typeof pet.$inferInsert> = {}) {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId, createdInOrgId: orgId, name: "โมจิ", species: "dog", ...extra })
    .returning();
  if (!p) throw new Error("pet fixture");
  await env.db.insert(petShopProfile).values({ organizationId: orgId, petId: p.id });
  return p;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("updates only the sent fields and records a customer weight", async () => {
  const s = await seedOrg(env.db, "up1");
  const p = await addPet(s.ownerProfileId, s.orgId, { breed: "พุดเดิ้ล", sex: "female" });
  const res = await call("shop-up1", s, p.id, { name: "โมจิจัง", neutered: false, weightGrams: 4500 });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffUpdatePetResponse;
  expect(LiffUpdatePetResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({ id: p.id, name: "โมจิจัง", breed: "พุดเดิ้ล", sex: "female", neutered: false, latestWeightGrams: 4500 });
  const [row] = await env.db.select().from(pet).where(eq(pet.id, p.id));
  expect(row).toMatchObject({ name: "โมจิจัง", neutered: false, latestWeightGrams: 4500 });
  expect(await env.db.select().from(petWeight).where(eq(petWeight.petId, p.id))).toMatchObject([
    { organizationId: s.orgId, weightGrams: 4500, source: "customer" },
  ]);
});

it("switches to species other with speciesOther and sets an age estimate", async () => {
  const s = await seedOrg(env.db, "up5");
  const p = await addPet(s.ownerProfileId, s.orgId);
  const res = await call("shop-up5", s, p.id, { species: "other", speciesOther: "เต่า", ageEstimateMonths: 30 });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ species: "other", speciesOther: "เต่า", ageEstimateMonths: 30 });
});

it("invalid fields → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "up2");
  const p = await addPet(s.ownerProfileId, s.orgId);
  for (const body of [{ name: "" }, { sex: "x" }, { birthDate: "2099-01-01" }, { species: "other" }, { color: "ขาว" }])
    expect(await errorCode(await call("shop-up2", s, p.id, body))).toBe("VALIDATION_FAILED");
  expect(await errorCode(await call("shop-up2", s, "not-a-uuid", {}))).toBe("VALIDATION_FAILED");
});

it("another owner's pet, a pet unknown to this shop, an inactive pet → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "up3");
  const other = await seedOrg(env.db, "up4");
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  if (!stranger) throw new Error("owner fixture");
  const notMine = await addPet(stranger.id, s.orgId);
  const otherShop = await addPet(s.ownerProfileId, other.orgId);
  const gone = await addPet(s.ownerProfileId, s.orgId, { status: "rehomed" });
  for (const id of [notMine.id, otherShop.id, gone.id, crypto.randomUUID()])
    expect(await errorCode(await call("shop-up3", s, id, { name: "x" }))).toBe("NOT_FOUND");
  const [row] = await env.db.select().from(pet).where(eq(pet.id, notMine.id));
  expect(row?.name).toBe("โมจิ");
});
