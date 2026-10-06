// T-0173 liff.pets: the customer's own active pets known to this shop, as MyPet (no internal note).
import { LiffPetsParams, LiffPetsResponse } from "@app/contracts/endpoints/liff.pets";
import { fileObject, ownerProfile, pet, petPhoto, petShopProfile } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { liffPets } from "../../../src/services/liff/pets.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.pets", { params: LiffPetsParams }, liffPets);
const call = async (slug: string, s: SeedOrg) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pets`, {
      headers: { origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}` },
    }),
    { params: { branchSlug: slug } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function addPet(ownerProfileId: string, orgId: string, name: string, extra: Partial<typeof pet.$inferInsert> = {}) {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId, createdInOrgId: orgId, name, species: "dog", ...extra })
    .returning();
  if (!p) throw new Error("pet fixture");
  return p;
}

beforeAll(async () => {
  env = await setupTestDb();
  setStorage(createFakeStorage());
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

it("lists own active pets with a profile in this shop: shared note, before/after photos, no internal note", async () => {
  const s = await seedOrg(env.db, "lp1");
  const other = await seedOrg(env.db, "lp2");
  const mochi = await addPet(s.ownerProfileId, s.orgId, "โมจิ", { breed: "พุดเดิ้ล", sex: "female", latestWeightGrams: 4200 });
  const gone = await addPet(s.ownerProfileId, s.orgId, "ข้าวปั้น", { status: "deceased" });
  const elsewhere = await addPet(s.ownerProfileId, other.orgId, "ถั่ว"); // known only to the other shop
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  if (!stranger) throw new Error("owner fixture");
  const strangers = await addPet(stranger.id, s.orgId, "ไม่ใช่ของฉัน");
  await env.db.insert(petShopProfile).values([
    { organizationId: s.orgId, petId: mochi.id, sharedNote: "แพ้แชมพูกลิ่นแรง", internalNote: "กัดตอนตัดเล็บ" },
    { organizationId: s.orgId, petId: gone.id },
    { organizationId: other.orgId, petId: elsewhere.id },
    { organizationId: s.orgId, petId: strangers.id },
  ]);
  const [after, profile] = await env.db
    .insert(fileObject)
    .values(
      ["after", "pet_profile"].map((kind) => ({
        organizationId: s.orgId,
        kind: kind as "after" | "pet_profile",
        storageKey: `${kind}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "staff" as const,
      })),
    )
    .returning();
  if (!after || !profile) throw new Error("file fixture");
  await env.db.insert(petPhoto).values([
    { organizationId: s.orgId, petId: mochi.id, fileId: after.id, kind: "after", caption: "ทรงหมีพูห์" },
    { organizationId: s.orgId, petId: mochi.id, fileId: profile.id, kind: "profile" },
  ]);

  const res = await call("shop-lp1", s);
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffPetsResponse;
  expect(LiffPetsResponse.safeParse(body).success).toBe(true);
  expect(body.map((p) => p.name)).toEqual(["โมจิ"]);
  expect(body[0]).toMatchObject({
    id: mochi.id,
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    latestWeightGrams: 4200,
    sharedNote: "แพ้แชมพูกลิ่นแรง",
    vaccinations: [],
    nextGroomDue: null,
  });
  expect(body[0]?.photos.map((p) => [p.kind, p.caption])).toEqual([["after", "ทรงหมีพูห์"]]);
  expect(JSON.stringify(body)).not.toContain("กัดตอนตัดเล็บ");
});

it("no pets → []; a session of another shop → UNAUTHENTICATED; unknown shop → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "lp3");
  const t = await seedOrg(env.db, "lp4");
  expect(await (await call("shop-lp3", s)).json()).toEqual([]);
  expect(await errorCode(await call("shop-lp4", s))).toBe("UNAUTHENTICATED");
  expect(await errorCode(await call("no-such-shop", t))).toBe("NOT_FOUND");
});
