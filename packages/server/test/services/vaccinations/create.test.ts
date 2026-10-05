import {
  VaccinationsCreateParams,
  VaccinationsCreateRequest,
  VaccinationsCreateResponse,
} from "@app/contracts/endpoints/vaccinations.create";
import { fileObject, pet, petShopProfile, petVaccination, vaccineType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { vaccinationsCreate } from "../../../src/services/vaccinations/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("vaccinations.create", { body: VaccinationsCreateRequest, params: VaccinationsCreateParams }, vaccinationsCreate);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;
const types = { dog: { code: "", months: 12 }, cat: { code: "", months: 12 } };
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const all = await env.db.select().from(vaccineType);
  for (const s of ["dog", "cat"] as const) {
    const t = all.find((x) => x.species === s);
    types[s] = { code: t?.code ?? "", months: t?.defaultValidityMonths ?? 12 };
  }
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
async function seedPet(org: SeedOrg = env.base) {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: org.orgId, petId: p?.id ?? "" });
  return { id: p?.id ?? "", name: p?.name ?? "" };
}
async function upload(kind: typeof fileObject.$inferInsert.kind = "vaccine_proof") {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind,
      storageKey: `org/x/${kind}/v${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 1, contentType: "image/jpeg" });
  return f?.id ?? "";
}
/** a customer-sent record waiting for review */
async function _pending(petId: string, status: "pending_review" | "verified" | "rejected" = "pending_review") {
  const [v] = await env.db
    .insert(petVaccination)
    .values({ petId, vaccineCode: types.dog.code, expiresOn: "2027-06-01", status, source: "customer" })
    .returning();
  return v?.id ?? "";
}
async function call(url: string, params: Record<string, string>, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const rowOf = async (id: string) => (await env.db.select().from(petVaccination).where(eq(petVaccination.id, id)))[0];
const create = (petId: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call(`/api/v1/staff/pets/${petId}/vaccinations`, { petId }, body, role);
const addMonths = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

it("the shop's record is verified, source shop, verified by this org/user; expiry defaults to administered + validity", async () => {
  const p = await seedPet();
  const proof = await upload();
  const res = await create(p.id, { vaccineCode: types.dog.code, administeredOn: "2026-03-15", proofFileId: proof });
  expect(res.status).toBe(200);
  const item = VaccinationsCreateResponse.parse(await res.json());
  expect(item).toMatchObject({
    vaccineCode: types.dog.code,
    administeredOn: "2026-03-15",
    expiresOn: addMonths("2026-03-15", types.dog.months),
    status: "verified",
    source: "shop",
    proofUrl: expect.any(String),
  });
  expect(await rowOf(item.id)).toMatchObject({ verifiedOrgId: env.base.orgId, verifiedBy: env.base.staff.front_desk, petId: p.id });
  expect((await env.db.select().from(fileObject).where(eq(fileObject.id, proof)))[0]?.committedAt).not.toBeNull();
  const explicit = VaccinationsCreateResponse.parse(
    await (await create(p.id, { vaccineCode: types.dog.code, expiresOn: "2027-01-31" }, "owner")).json(),
  );
  expect(explicit).toMatchObject({ administeredOn: null, expiresOn: "2027-01-31", proofUrl: null });
});

it("a vaccine of another species, a future date or a proof of another kind → VALIDATION_FAILED", async () => {
  const p = await seedPet();
  expect(await codeOf(await create(p.id, { vaccineCode: types.cat.code, expiresOn: "2027-01-01" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await create(p.id, { vaccineCode: "NOPE", expiresOn: "2027-01-01" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await create(p.id, { vaccineCode: types.dog.code, administeredOn: "2099-01-01" }))).toBe("VALIDATION_FAILED");
  expect(
    await codeOf(await create(p.id, { vaccineCode: types.dog.code, expiresOn: "2027-01-01", proofFileId: await upload("slip") })),
  ).toBe("VALIDATION_FAILED");
  expect(await env.db.select().from(petVaccination).where(eq(petVaccination.petId, p.id))).toEqual([]);
});

it.each([
  ["missing code", { expiresOn: "2027-01-01" }],
  ["neither date", { vaccineCode: "X" }],
  ["bad date", { vaccineCode: "X", expiresOn: "01/01/2027" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await create((await seedPet()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's pet → NOT_FOUND", async () => {
  expect(await codeOf(await create((await seedPet()).id, { vaccineCode: types.dog.code, expiresOn: "2027-01-01" }, "staff"))).toBe(
    "FORBIDDEN",
  );
  expect(await codeOf(await create((await seedPet(other)).id, { vaccineCode: types.dog.code, expiresOn: "2027-01-01" }))).toBe("NOT_FOUND");
});
