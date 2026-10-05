import {
  VaccinationsVerifyParams,
  VaccinationsVerifyRequest,
  VaccinationsVerifyResponse,
} from "@app/contracts/endpoints/vaccinations.verify";
import { fileObject, pet, petShopProfile, petVaccination, vaccineType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { vaccinationsVerify } from "../../../src/services/vaccinations/verify.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("vaccinations.verify", { body: VaccinationsVerifyRequest, params: VaccinationsVerifyParams }, vaccinationsVerify);
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
async function pending(petId: string, status: "pending_review" | "verified" | "rejected" = "pending_review") {
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
const verify = (id: string, body: unknown = {}, role?: "owner" | "front_desk" | "staff") =>
  call(`/api/v1/staff/vaccinations/${id}/verify`, { vaccinationId: id }, body, role);

it("pending_review → verified by this org/user; the expiry can be corrected", async () => {
  const id = await pending((await seedPet()).id);
  const res = await verify(id, { expiresOn: "2027-05-31" });
  expect(res.status).toBe(200);
  expect(VaccinationsVerifyResponse.parse(await res.json())).toMatchObject({
    status: "verified",
    expiresOn: "2027-05-31",
    source: "customer",
  });
  expect(await rowOf(id)).toMatchObject({ verifiedOrgId: env.base.orgId, verifiedBy: env.base.staff.front_desk });
  const keep = await pending((await seedPet()).id);
  expect(VaccinationsVerifyResponse.parse(await (await verify(keep, {}, "owner")).json()).expiresOn).toBe("2027-06-01");
  void upload;
});

it("already verified / rejected → INVALID_TRANSITION", async () => {
  const p = await seedPet();
  for (const status of ["verified", "rejected"] as const)
    expect(await codeOf(await verify(await pending(p.id, status)))).toBe("INVALID_TRANSITION");
});

it("bad date → VALIDATION_FAILED; role staff → FORBIDDEN; another org's pet → NOT_FOUND", async () => {
  const id = await pending((await seedPet()).id);
  expect(await codeOf(await verify(id, { expiresOn: "soon" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await verify(id, {}, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await verify(await pending((await seedPet(other)).id)))).toBe("NOT_FOUND");
});
