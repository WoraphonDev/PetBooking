// T-0174 liff.addVaccination: the customer sends vaccine proof → pending_review, source customer, staff.vaccine_review.
import {
  LiffAddVaccinationParams,
  LiffAddVaccinationRequest,
  LiffAddVaccinationResponse,
} from "@app/contracts/endpoints/liff.addVaccination";
import { fileObject, notification, ownerProfile, pet, petShopProfile, petVaccination, vaccineType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { liffAddVaccination } from "../../../src/services/liff/addVaccination.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let dogVaccine = "";
let catVaccine = "";
const storage = createFakeStorage();
const POST = withCustomer("liff.addVaccination", { params: LiffAddVaccinationParams, body: LiffAddVaccinationRequest }, liffAddVaccination);
const call = async (slug: string, s: SeedOrg, petId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pets/${petId}/vaccinations`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug, petId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function addPet(ownerProfileId: string, orgId: string) {
  const [p] = await env.db.insert(pet).values({ ownerProfileId, createdInOrgId: orgId, name: "โมจิ", species: "dog" }).returning();
  if (!p) throw new Error("pet fixture");
  await env.db.insert(petShopProfile).values({ organizationId: orgId, petId: p.id });
  return p;
}
async function proof(s: SeedOrg, key: string, kind: "vaccine_proof" | "slip" = "vaccine_proof") {
  const [f] = await env.db
    .insert(fileObject)
    .values({ organizationId: s.orgId, kind, storageKey: key, mimeType: "image/jpeg", sizeBytes: 10, uploadedByType: "customer" })
    .returning();
  if (!f) throw new Error("file fixture");
  storage.put(key, { sizeBytes: 10, contentType: "image/jpeg" });
  return f;
}

beforeAll(async () => {
  env = await setupTestDb();
  setStorage(storage);
  const all = await env.db.select().from(vaccineType);
  dogVaccine = all.find((t) => t.species === "dog")?.code ?? "";
  catVaccine = all.find((t) => t.species === "cat")?.code ?? "";
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("stores a pending_review customer vaccination with its proof and notifies front desk", async () => {
  const s = await seedOrg(env.db, "av1");
  const p = await addPet(s.ownerProfileId, s.orgId);
  const f = await proof(s, "av1.jpg");
  const res = await call("shop-av1", s, p.id, {
    vaccineCode: dogVaccine,
    administeredOn: "2026-01-10",
    expiresOn: "2027-01-10",
    proofFileId: f.id,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffAddVaccinationResponse;
  expect(LiffAddVaccinationResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    vaccineCode: dogVaccine,
    administeredOn: "2026-01-10",
    expiresOn: "2027-01-10",
    status: "pending_review",
    source: "customer",
    rejectReason: null,
  });
  expect(body.proofUrl).toContain("av1.jpg");
  const [row] = await env.db.select().from(petVaccination).where(eq(petVaccination.id, body.id));
  expect(row).toMatchObject({ petId: p.id, proofFileId: f.id, status: "pending_review", source: "customer", verifiedBy: null });
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).not.toBeNull();
  const sent = await env.db.select().from(notification).where(eq(notification.templateKey, "staff.vaccine_review"));
  expect(sent.filter((n) => n.organizationId === s.orgId)).toMatchObject([
    { recipientId: s.staff.front_desk, payload: { petName: "โมจิ" }, dedupeKey: `vaccine_review:${body.id}:${s.staff.front_desk}` },
  ]);
});

it("missing / invalid fields, wrong species, future dose, expiry before dose, non-proof file → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "av2");
  const p = await addPet(s.ownerProfileId, s.orgId);
  const f = await proof(s, "av2.jpg");
  const slip = await proof(s, "av2-slip.jpg", "slip");
  const ok = { vaccineCode: dogVaccine, expiresOn: "2027-01-10", proofFileId: f.id };
  const { proofFileId: _p, ...noProof } = ok;
  const { expiresOn: _e, ...noExpiry } = ok;
  for (const body of [
    noProof,
    noExpiry,
    { ...ok, vaccineCode: "" },
    { ...ok, vaccineCode: catVaccine },
    { ...ok, administeredOn: "2099-01-01" },
    { ...ok, administeredOn: "2026-05-01", expiresOn: "2026-04-01" },
    { ...ok, proofFileId: slip.id },
    { ...ok, status: "verified" },
  ])
    expect(await errorCode(await call("shop-av2", s, p.id, body))).toBe("VALIDATION_FAILED");
  expect(await env.db.select().from(petVaccination).where(eq(petVaccination.petId, p.id))).toEqual([]);
});

it("another owner's pet or a pet of another shop → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "av3");
  const other = await seedOrg(env.db, "av4");
  const f = await proof(s, "av3.jpg");
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  if (!stranger) throw new Error("owner fixture");
  const notMine = await addPet(stranger.id, s.orgId);
  const elsewhere = await addPet(s.ownerProfileId, other.orgId);
  for (const id of [notMine.id, elsewhere.id])
    expect(await errorCode(await call("shop-av3", s, id, { vaccineCode: dogVaccine, expiresOn: "2027-01-10", proofFileId: f.id }))).toBe(
      "NOT_FOUND",
    );
});
