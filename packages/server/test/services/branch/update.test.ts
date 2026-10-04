import { BranchUpdateRequest, BranchUpdateResponse } from "@app/contracts/endpoints/branch.update";
import { branch, branchPolicy, fileObject } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { branchUpdate } from "../../../src/services/branch/update.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId });
});
afterAll(async () => {
  await env.close();
});
const fields = {
  name: "New shop",
  phone: "081-234-5678",
  addressLine: "12 Road",
  subdistrict: "District",
  district: "District",
  province: "กรุงเทพมหานคร",
  postalCode: "10100",
  latitude: 13.75,
  longitude: 100.5,
  facebookUrl: "https://facebook.com/pet",
  instagramUrl: "https://instagram.com/pet",
  receiptPrefix: "PET",
};
it("updates every field, normalizes phone and stamps ctx.now", async () => {
  const result = BranchUpdateResponse.parse(await branchUpdate(staffCtx(env.base, "owner"), BranchUpdateRequest.parse(fields)));
  expect(result).toMatchObject({ ...fields, phone: "+66812345678" });
  const [row] = await env.db.select().from(branch).where(eq(branch.id, env.base.branchId));
  expect(row).toMatchObject({ ...fields, phone: "+66812345678", updatedAt: TEST_NOW });
});
it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  await expect(branchUpdate(staffCtx(env.base, role), { name: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects a foreign branch", async () => {
  await expect(branchUpdate({ ...staffCtx(env.base, "owner"), branchId: foreign.branchId }, { name: "No" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("validates coordinates, province, URL, prefix, postal code, text and phone", async () => {
  for (const change of [
    { name: "" },
    { addressLine: "x".repeat(201) },
    { latitude: 91 },
    { longitude: -181 },
    { province: "Invalid" },
    { facebookUrl: "bad" },
    { receiptPrefix: "pet" },
    { postalCode: "1234" },
  ])
    expect(BranchUpdateRequest.safeParse(change).success).toBe(false);
  await expect(branchUpdate(staffCtx(env.base, "owner"), { phone: "bad" })).rejects.toMatchObject({ code: "INVALID_PHONE" });
});

it("commits a signed logo atomically and rolls back failed signing", async () => {
  const storage = createFakeStorage();
  setStorage(storage);
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "logo",
      storageKey: "branch-logo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("logo fixture");
  storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
  const [before] = await env.db.select().from(branch).where(eq(branch.id, env.base.branchId));
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  try {
    await expect(branchUpdate(staffCtx(env.base, "owner"), { logoFileId: f.id, name: "Rollback" })).rejects.toThrow("signing failed");
  } finally {
    setStorage(storage);
  }
  const [after] = await env.db.select().from(branch).where(eq(branch.id, env.base.branchId));
  expect(after).toEqual(before);
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toBeNull();
  const result = await branchUpdate(staffCtx(env.base, "owner"), { logoFileId: f.id });
  expect(result.logoUrl).toContain("branch-logo.jpg?op=get");
  const [bound] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(bound?.committedAt).toEqual(TEST_NOW);
  setStorage(null);
});
it("returns HTTP VALIDATION_FAILED for malformed body fields", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const PATCH = withStaff("branch.update", { body: BranchUpdateRequest }, branchUpdate);
  for (const body of [{ name: "" }, { province: "Invalid" }, { logoFileId: "bad" }, { receiptPrefix: "lower" }]) {
    const response = await PATCH(
      new Request("https://petbooking.test/api/v1/staff/branch", {
        method: "PATCH",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
