import {
  PetsUpdateShopProfileParams,
  PetsUpdateShopProfileRequest,
  PetsUpdateShopProfileResponse,
} from "@app/contracts/endpoints/pets.updateShopProfile";
import { fileObject, pet, petPhoto, petShopProfile } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { petsUpdateShopProfile } from "../../../src/services/pets/updateShopProfile.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff(
  "pets.updateShopProfile",
  { body: PetsUpdateShopProfileRequest, params: PetsUpdateShopProfileParams },
  petsUpdateShopProfile,
);
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
const put = (petId: string, body: unknown, role?: "owner" | "front_desk" | "staff") => call("PUT", "shop-profile", petId, body, role);
const profileOf = async (petId: string, org = env.base.orgId) =>
  (
    await env.db
      .select()
      .from(petShopProfile)
      .where(and(eq(petShopProfile.petId, petId), eq(petShopProfile.organizationId, org)))
  )[0];

it("saves the sent fields (vet phone by R-22) for any staff role; fields left out stay, null clears; another shop's profile is untouched", async () => {
  const id = await seedPet(env.base, true);
  await env.db.update(petShopProfile).set({ bladeNo: "#10" }).where(eq(petShopProfile.petId, id));
  const res = await put(id, {
    preferredStyle: "ตัดสั้นทั้งตัว หน้ากลม",
    shampooAvoid: "แชมพูกลิ่นแรง",
    allergies: "ไก่",
    vetClinicName: "คลินิกใกล้บ้าน",
    vetClinicPhone: "02-123-4567",
    internalNote: "กลัวไดร์",
    sharedNote: "น้องชอบขนม",
    groomIntervalDays: 30,
  });
  expect(res.status).toBe(200);
  const d = PetsUpdateShopProfileResponse.parse(await res.json());
  expect(d.shop).toMatchObject({
    preferredStyle: "ตัดสั้นทั้งตัว หน้ากลม",
    bladeNo: "#10",
    vetClinicPhone: "+6621234567",
    groomIntervalDays: 30,
    sharedNote: "น้องชอบขนม",
  });
  expect(await profileOf(id)).toMatchObject({ allergies: "ไก่", internalNote: "กลัวไดร์", bladeNo: "#10" });
  expect((await profileOf(id, other.orgId))?.allergies).toBeNull();
  await put(id, { bladeNo: null, groomIntervalDays: null }, "owner");
  expect(await profileOf(id)).toMatchObject({ bladeNo: null, groomIntervalDays: null, allergies: "ไก่" });
});

it("favourite style photo: a photo of this pet is kept, another pet's photo → VALIDATION_FAILED", async () => {
  const id = await seedPet();
  const otherPet = await seedPet();
  const photo = async (petId: string) => {
    const [f] = await env.db
      .insert(fileObject)
      .values({
        organizationId: env.base.orgId,
        kind: "after",
        storageKey: `org/x/after/p${++seq}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadedByType: "staff",
        committedAt: new Date(),
      })
      .returning();
    storage.put(f?.storageKey ?? "", { sizeBytes: 1, contentType: "image/jpeg" });
    const [ph] = await env.db
      .insert(petPhoto)
      .values({
        organizationId: env.base.orgId,
        petId,
        fileId: f?.id ?? "",
        kind: "after",
        takenAt: new Date(),
        uploadedBy: env.base.staff.staff,
      })
      .returning();
    return ph?.id ?? "";
  };
  const mine = await photo(id);
  expect(
    PetsUpdateShopProfileResponse.parse(await (await put(id, { favoriteStylePhotoId: mine })).json()).shop.favoriteStylePhotoUrl,
  ).toBeTruthy();
  expect(await codeOf(await put(id, { favoriteStylePhotoId: await photo(otherPet) }))).toBe("VALIDATION_FAILED");
});

it.each([
  ["style over 200", { preferredStyle: "ก".repeat(201) }],
  ["blade over 20", { bladeNo: "ก".repeat(21) }],
  ["interval 6", { groomIntervalDays: 6 }],
  ["interval 181", { groomIntervalDays: 181 }],
  ["shared note over 1000", { sharedNote: "ก".repeat(1001) }],
  ["unknown field", { nickname: "x" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await put(await seedPet(), body))).toBe("VALIDATION_FAILED");
});

it("a bad vet phone → INVALID_PHONE; another org's pet → NOT_FOUND", async () => {
  expect(await codeOf(await put(await seedPet(), { vetClinicPhone: "123" }))).toBe("INVALID_PHONE");
  expect(await codeOf(await put(await seedPet(other), { allergies: "x" }))).toBe("NOT_FOUND");
});
