import { CustomerUploadUrlRequest, CustomerUploadUrlResponse } from "@app/contracts/endpoints/customer.uploadUrl";
import { customer, fileObject, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withCustomer } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { customerUploadUrl } from "../../../src/services/customer/uploadUrl.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const POST = withCustomer("customer.uploadUrl", { body: CustomerUploadUrlRequest }, customerUploadUrl);
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  setStorage(createFakeStorage());
  await env.db.delete(fileObject);
  resetRateLimits();
});

async function post(body: unknown, opts: { slug?: string; session?: SeedOrg | null; ownerProfileId?: string } = {}) {
  const org = opts.session === undefined ? env.base : opts.session;
  const headers: Record<string, string> = { origin: "https://petbooking.test" };
  if (org) {
    const login = await createSession(
      env.db,
      { subjectType: "customer", subjectId: opts.ownerProfileId ?? org.ownerProfileId, organizationId: org.orgId, branchId: org.branchId },
      new Date(),
    );
    headers.cookie = `cid=${login.token}`;
  }
  const slug = opts.slug ?? "shop-a";
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/files/upload-url`, { method: "POST", headers, body: JSON.stringify(body) }),
    {
      params: { branchSlug: slug },
    },
  );
}
const codeOf = async (res: Response) => ({ status: res.status, code: (await res.json()).error.code });

it.each([
  { kind: "pet_profile", mimeType: "image/webp", sizeBytes: 800_000 },
  { kind: "vaccine_proof", mimeType: "application/pdf", sizeBytes: 4_000_000 },
  { kind: "slip", mimeType: "image/jpeg", sizeBytes: 250_000 },
])("a registered customer gets a ticket for $kind", async (input) => {
  const res = await post(input);
  expect(res.status).toBe(200);
  const body = CustomerUploadUrlResponse.parse(await res.json());
  expect(body.storageKey.startsWith(`org/${env.base.orgId}/${input.kind}/`)).toBe(true);
  const [row] = await env.db.select().from(fileObject).where(eq(fileObject.id, body.fileId));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    uploadedByType: "customer",
    uploadedById: env.base.customerId,
    committedAt: null,
  });
});

it.each(["before", "signature", "import_csv", "stay_update"])("kind %s is staff-only → UPLOAD_KIND_NOT_ALLOWED", async (kind) => {
  expect(await codeOf(await post({ kind, mimeType: "image/png", sizeBytes: 1000 }))).toEqual({
    status: 422,
    code: "UPLOAD_KIND_NOT_ALLOWED",
  });
  expect(await env.db.select().from(fileObject)).toEqual([]);
});

it.each([
  [{ kind: "slip", mimeType: "video/mp4", sizeBytes: 1000 }, "UPLOAD_TYPE_NOT_ALLOWED"],
  [{ kind: "slip", mimeType: "image/jpeg", sizeBytes: 2_000_001 }, "UPLOAD_TOO_LARGE"],
])("%j → %s", async (input, code) => {
  expect(await codeOf(await post(input))).toEqual({ status: 422, code });
});

it("unknown branch slug → NOT_FOUND; another shop's session → UNAUTHENTICATED; no session → UNAUTHENTICATED", async () => {
  const slip = { kind: "slip", mimeType: "image/jpeg", sizeBytes: 1000 };
  expect((await codeOf(await post(slip, { slug: "nope" }))).code).toBe("NOT_FOUND");
  expect((await codeOf(await post(slip, { session: other }))).code).toBe("UNAUTHENTICATED");
  expect((await codeOf(await post(slip, { session: null }))).code).toBe("UNAUTHENTICATED");
  expect(await env.db.select().from(fileObject)).toEqual([]);
});

it("a LINE user not yet registered in this shop → NOT_REGISTERED", async () => {
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: other.orgId, firstName: "x" }).returning();
  const res = await post({ kind: "slip", mimeType: "image/jpeg", sizeBytes: 1000 }, { ownerProfileId: stranger?.id });
  expect((await codeOf(res)).code).toBe("NOT_REGISTERED");
  expect(
    await env.db
      .select()
      .from(customer)
      .where(eq(customer.ownerProfileId, stranger?.id ?? "")),
  ).toEqual([]);
});
