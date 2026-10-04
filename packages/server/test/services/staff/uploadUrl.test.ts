import { StaffUploadUrlRequest, StaffUploadUrlResponse } from "@app/contracts/endpoints/staff.uploadUrl";
import { fileObject } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { staffUploadUrl } from "../../../src/services/staff/uploadUrl.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const POST = withStaff("staff.uploadUrl", { body: StaffUploadUrlRequest }, staffUploadUrl);
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

async function post(body: unknown, role: "owner" | "front_desk" | "staff" | null = "owner", org: SeedOrg = env.base) {
  const headers: Record<string, string> = { origin: "https://petbooking.test" };
  if (role) {
    const login = await createSession(
      env.db,
      { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
      new Date(),
    );
    headers.cookie = `sid=${login.token}`;
  }
  return POST(
    new Request("https://petbooking.test/api/v1/staff/files/upload-url", { method: "POST", headers, body: JSON.stringify(body) }),
  );
}
const photo = { kind: "after", mimeType: "image/jpeg", sizeBytes: 450_000, width: 1600, height: 1067 };

it.each(["owner", "front_desk", "staff"] as const)("%s gets an UploadTicket and an uncommitted file_object", async (role) => {
  const res = await post(photo, role);
  expect(res.status).toBe(200);
  const body = StaffUploadUrlResponse.parse(await res.json());
  expect(body.headers).toEqual({ "Content-Type": "image/jpeg" });
  expect(body.storageKey).toMatch(new RegExp(`^org/${env.base.orgId}/after/\\d{4}/\\d{2}/${body.fileId}\\.jpg$`));
  const [row] = await env.db.select().from(fileObject).where(eq(fileObject.id, body.fileId));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    kind: "after",
    uploadedByType: "staff",
    uploadedById: env.base.staff[role],
    committedAt: null,
  });
});

it("staff may use staff-only kinds such as signature and import_csv", async () => {
  expect((await post({ kind: "signature", mimeType: "image/png", sizeBytes: 20_000 })).status).toBe(200);
  expect((await post({ kind: "import_csv", mimeType: "text/csv", sizeBytes: 50_000 })).status).toBe(200);
});

it("files land in the session's own org", async () => {
  const body = StaffUploadUrlResponse.parse(await (await post(photo, "owner", other)).json());
  expect(body.storageKey.startsWith(`org/${other.orgId}/`)).toBe(true);
  const [row] = await env.db.select().from(fileObject).where(eq(fileObject.id, body.fileId));
  expect(row?.organizationId).toBe(other.orgId);
});

it.each([
  [{ ...photo, mimeType: "application/pdf" }, 422, "UPLOAD_TYPE_NOT_ALLOWED"],
  [{ ...photo, sizeBytes: 2_000_001 }, 422, "UPLOAD_TOO_LARGE"],
  [{ ...photo, kind: "selfie" }, 422, "VALIDATION_FAILED"],
  [{ ...photo, sizeBytes: 1.5 }, 422, "VALIDATION_FAILED"],
])("%j → %s %s", async (body, status, code) => {
  const res = await post(body);
  expect({ status: res.status, code: ((await res.json()) as { error: { code: string } }).error.code }).toEqual({ status, code });
  expect(await env.db.select().from(fileObject)).toEqual([]);
});

it("needs a staff session", async () => {
  const res = await post(photo, null);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHENTICATED");
});

it("the service refuses a customer context (role matrix)", async () => {
  await expect(staffUploadUrl(customerCtx(env.base), StaffUploadUrlRequest.parse(photo))).rejects.toMatchObject({ code: "FORBIDDEN" });
});
