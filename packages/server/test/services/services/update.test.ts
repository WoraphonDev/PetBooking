import { ServicesUpdateParams, ServicesUpdateRequest, ServicesUpdateResponse } from "@app/contracts/endpoints/services.update";
import { fileObject, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { servicesUpdate } from "../../../src/services/services/update.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
const storage = createFakeStorage();
beforeAll(async () => {
  env = await setupTestDb();
  setStorage(storage);
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  await env.close();
  setStorage(null);
});

let serviceId: string;
beforeAll(async () => {
  const [row] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, scope: "grooming", category: "bath", nameTh: "Bath" })
    .returning();
  serviceId = row!.id;
});
it("updates every mutable field and stamps ctx.now", async () => {
  const fields = {
    category: "spa",
    nameTh: "Spa",
    description: "Warm bath",
    speciesAllowed: ["cat"],
    isAddon: true,
    addonPerDay: false,
    onlineBookable: false,
    estCostSatang: 1500,
    sortOrder: 2,
    status: "archived",
  } as const;
  const result = ServicesUpdateResponse.parse(
    await servicesUpdate(staffCtx(env.base, "owner"), { ...ServicesUpdateRequest.parse(fields), serviceId }),
  );
  expect(result).toMatchObject({ ...fields, scope: "grooming" });
  const [row] = await env.db.select().from(service).where(eq(service.id, serviceId));
  expect(row).toMatchObject({ ...fields, updatedAt: TEST_NOW });
});
it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  await expect(servicesUpdate(staffCtx(env.base, role), { serviceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects foreign services and a category incompatible with the stored scope", async () => {
  await expect(servicesUpdate(staffCtx(foreign, "owner"), { serviceId, nameTh: "Other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(servicesUpdate(staffCtx(env.base, "owner"), { serviceId, category: "hotel_addon" })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});
it("rejects scope changes and invalid fields", () => {
  for (const body of [{ scope: "hotel" }, { nameTh: "x".repeat(81) }, { status: "bad" }, { photoFileId: "bad" }])
    expect(ServicesUpdateRequest.safeParse(body).success).toBe(false);
});

it("replaces a photo atomically and preserves its reference on signing failure", async () => {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "service_photo",
      storageKey: "service-update.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("photo fixture");
  storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
  const [before] = await env.db.select().from(service).where(eq(service.id, serviceId));
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  try {
    await expect(servicesUpdate(staffCtx(env.base, "owner"), { serviceId, photoFileId: f.id, nameTh: "Should roll back" })).rejects.toThrow(
      "signing failed",
    );
  } finally {
    setStorage(storage);
  }
  const [after] = await env.db.select().from(service).where(eq(service.id, serviceId));
  expect(after).toEqual(before);
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toBeNull();
  const result = await servicesUpdate(staffCtx(env.base, "owner"), { serviceId, photoFileId: f.id });
  expect(result.photoUrl).toContain("service-update.jpg?op=get");
  const [bound] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(bound?.committedAt).toEqual(TEST_NOW);
});
it("returns HTTP VALIDATION_FAILED for forbidden scope, invalid status and malformed id", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const PATCH = withStaff("services.update", { body: ServicesUpdateRequest, params: ServicesUpdateParams }, servicesUpdate);
  for (const [id, body] of [
    [serviceId, { scope: "hotel" }],
    [serviceId, { status: "bad" }],
    ["bad", { nameTh: "Valid" }],
  ] as const) {
    const response = await PATCH(
      new Request(`https://petbooking.test/api/v1/staff/services/${id}`, {
        method: "PATCH",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(body),
      }),
      { params: { serviceId: id } },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
