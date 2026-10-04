import {
  StaysSignAgreementParams,
  StaysSignAgreementRequest,
  StaysSignAgreementResponse,
} from "@app/contracts/endpoints/stays.signAgreement";
import { booking, branchPolicy, consentDocument, fileObject, pet, roomType, roomUnit, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { staysSignAgreement } from "../../../src/services/stays/signAgreement.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.signAgreement", { body: StaysSignAgreementRequest, params: StaysSignAgreementParams }, staysSignAgreement);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;

async function signature(mimeType = "image/png", kind: typeof fileObject.$inferInsert.kind = "signature") {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind,
      storageKey: `org/x/${kind}/s${++seq}.png`,
      mimeType,
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: mimeType });
  return f?.id ?? "";
}
async function seedStay(org: SeedOrg = env.base) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const [t] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [u] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: t?.id ?? "", code: `R${seq}` })
    .returning();
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: t?.id ?? "",
      roomUnitId: u?.id ?? "",
      checkInDate: "2026-10-05",
      checkOutDate: "2026-10-07",
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
    })
    .returning();
  return s?.id ?? "";
}

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, boardingAgreementText: "ร้านดูแลน้องตามข้อตกลงนี้" });
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

async function sign(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/agreement`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const docsOf = async (stayId: string) => env.db.select().from(consentDocument).where(eq(consentDocument.stayId, stayId));

it("records the agreement with the policy text and the PNG signature; signing again adds a new row", async () => {
  const id = await seedStay();
  const sig = await signature();
  const res = await sign(id, { signerName: "คุณมะลิ", signatureFileId: sig, emergencyVetLimitSatang: 300_000 });
  expect(res.status).toBe(200);
  const d = StaysSignAgreementResponse.parse(await res.json());
  expect(d.agreement).toMatchObject({ signerName: "คุณมะลิ", emergencyVetLimitSatang: 300_000 });
  expect(d.stay.agreementSigned).toBe(true);
  const [doc] = await docsOf(id);
  expect(doc).toMatchObject({
    kind: "boarding_agreement",
    appointmentId: null,
    customerId: env.base.customerId,
    bodySnapshot: "ร้านดูแลน้องตามข้อตกลงนี้",
    signerName: "คุณมะลิ",
    signatureFileId: sig,
    emergencyVetLimitSatang: 300_000,
  });
  expect((await env.db.select().from(fileObject).where(eq(fileObject.id, sig)))[0]?.committedAt).not.toBeNull();

  const again = StaysSignAgreementResponse.parse(
    await (await sign(id, { signerName: "คุณมะลิ (ใหม่)", signatureFileId: await signature() }, "owner")).json(),
  );
  expect(again.agreement).toMatchObject({ signerName: "คุณมะลิ (ใหม่)", emergencyVetLimitSatang: null });
  const docs = await docsOf(id);
  expect(docs).toHaveLength(2);
  expect(docs.find((x) => x.id === doc?.id)).toMatchObject({ signerName: "คุณมะลิ", emergencyVetLimitSatang: 300_000 });
});

it.each([
  ["missing signer", { signatureFileId: "00000000-0000-4000-8000-000000000001" }],
  ["missing signature", { signerName: "มะลิ" }],
  ["negative vet limit", { signerName: "มะลิ", signatureFileId: "00000000-0000-4000-8000-000000000001", emergencyVetLimitSatang: -1 }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await sign(await seedStay(), body))).toBe("VALIDATION_FAILED");
});

it("a signature that is not a PNG signature file → VALIDATION_FAILED, nothing saved", async () => {
  const id = await seedStay();
  expect(await codeOf(await sign(id, { signerName: "มะลิ", signatureFileId: await signature("image/jpeg") }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await sign(id, { signerName: "มะลิ", signatureFileId: await signature("image/png", "slip") }))).toBe(
    "VALIDATION_FAILED",
  );
  expect(await docsOf(id)).toEqual([]);
});

it("role staff → FORBIDDEN; another org's stay → NOT_FOUND", async () => {
  const sig = await signature();
  expect(await codeOf(await sign(await seedStay(), { signerName: "มะลิ", signatureFileId: sig }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await sign(await seedStay(other), { signerName: "มะลิ", signatureFileId: sig }))).toBe("NOT_FOUND");
});
