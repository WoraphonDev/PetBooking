import {
  VaccinationsRejectParams,
  VaccinationsRejectRequest,
  VaccinationsRejectResponse,
} from "@app/contracts/endpoints/vaccinations.reject";
import { fileObject, notification, pet, petShopProfile, petVaccination, vaccineType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { vaccinationsReject } from "../../../src/services/vaccinations/reject.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("vaccinations.reject", { body: VaccinationsRejectRequest, params: VaccinationsRejectParams }, vaccinationsReject);
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
const _rowOf = async (id: string) => (await env.db.select().from(petVaccination).where(eq(petVaccination.id, id)))[0];
const reject = (id: string, body: unknown, role?: "owner" | "front_desk" | "staff") =>
  call(`/api/v1/staff/vaccinations/${id}/reject`, { vaccinationId: id }, body, role);

it("pending_review → rejected with the reason; the owner is told with a link to the pet page", async () => {
  const p = await seedPet();
  const id = await pending(p.id);
  const res = await reject(id, { reason: "รูปไม่ชัด" });
  expect(res.status).toBe(200);
  expect(VaccinationsRejectResponse.parse(await res.json())).toMatchObject({ status: "rejected", rejectReason: "รูปไม่ชัด" });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `vaccine_rejected:${id}:${env.base.customerId}`));
  expect(note).toMatchObject({
    templateKey: "customer.vaccine_rejected",
    payload: {
      petName: p.name,
      reason: "รูปไม่ชัด",
      vaccineName: expect.any(String),
      petUrl: expect.stringMatching(new RegExp(`/liff/[^/]+/pets/${p.id}$`)),
    },
  });
  void upload;
});

it("already verified / rejected → INVALID_TRANSITION", async () => {
  const p = await seedPet();
  for (const status of ["verified", "rejected"] as const)
    expect(await codeOf(await reject(await pending(p.id, status), { reason: "รูปไม่ชัด" }))).toBe("INVALID_TRANSITION");
});

it("short reason → VALIDATION_FAILED; role staff → FORBIDDEN; another org's pet → NOT_FOUND", async () => {
  const id = await pending((await seedPet()).id);
  expect(await codeOf(await reject(id, { reason: "no" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await reject(id, { reason: "รูปไม่ชัด" }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await reject(await pending((await seedPet(other)).id), { reason: "รูปไม่ชัด" }))).toBe("NOT_FOUND");
});
