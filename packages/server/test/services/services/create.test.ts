import { ServicesCreateRequest, ServicesCreateResponse } from "@app/contracts/endpoints/services.create";
import { fileObject, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { servicesCreate } from "../../../src/services/services/create.ts";
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

const body = {
  scope: "grooming",
  category: "bath",
  nameTh: "Bath",
  description: "Gentle wash",
  speciesAllowed: ["dog"],
  isAddon: false,
  addonPerDay: false,
  onlineBookable: false,
  estCostSatang: 2000,
  sortOrder: 3,
} as const;
it("creates every field and returns the service DTO", async () => {
  const result = ServicesCreateResponse.parse(await servicesCreate(staffCtx(env.base, "owner"), ServicesCreateRequest.parse(body)));
  expect(result).toMatchObject({ ...body, photoUrl: null, prices: [], addonForServiceIds: [], fromPriceSatang: null, status: "active" });
  const [row] = await env.db.select().from(service).where(eq(service.id, result.id));
  expect(row).toMatchObject({
    ...body,
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
});
it("uses database defaults for omitted fields", async () => {
  const result = await servicesCreate(
    staffCtx(env.base, "owner"),
    ServicesCreateRequest.parse({ scope: "grooming", category: "bath", nameTh: "Basic", isAddon: false }),
  );
  expect(result).toMatchObject({
    description: null,
    speciesAllowed: [],
    addonPerDay: false,
    onlineBookable: true,
    estCostSatang: null,
    sortOrder: 0,
  });
});
it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  await expect(servicesCreate(staffCtx(env.base, role), ServicesCreateRequest.parse(body))).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects invalid fields and category/scope pairs", () => {
  for (const change of [
    { nameTh: "" },
    { description: "x".repeat(501) },
    { estCostSatang: -1 },
    { estCostSatang: 1.5 },
    { category: "hotel_addon" },
    { addonPerDay: true },
  ])
    expect(ServicesCreateRequest.safeParse({ ...body, ...change }).success).toBe(false);
});
it("rejects another organization's branch", async () => {
  await expect(
    servicesCreate({ ...staffCtx(env.base, "owner"), branchId: foreign.branchId }, ServicesCreateRequest.parse(body)),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

async function photo(orgId = env.base.orgId, kind: "service_photo" | "logo" = "service_photo", uploaded = true) {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: orgId,
      kind,
      storageKey: `${orgId}/${crypto.randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("photo fixture");
  if (uploaded) storage.put(f.storageKey, { sizeBytes: 10, contentType: "image/jpeg" });
  return f;
}
it("binds an uploaded photo and returns its signed URL", async () => {
  const f = await photo();
  const result = await servicesCreate(staffCtx(env.base, "owner"), { ...ServicesCreateRequest.parse(body), photoFileId: f.id });
  expect(result.photoUrl).toContain(f.storageKey + "?op=get");
  const [row] = await env.db.select().from(service).where(eq(service.id, result.id));
  expect(row?.photoFileId).toBe(f.id);
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toEqual(TEST_NOW);
});
it("rejects foreign, wrong-kind and absent uploads without creating services", async () => {
  const count = (await env.db.select().from(service)).length;
  for (const [f, code] of [
    [await photo(foreign.orgId), "NOT_FOUND"],
    [await photo(env.base.orgId, "logo"), "VALIDATION_FAILED"],
    [await photo(env.base.orgId, "service_photo", false), "FILE_NOT_UPLOADED"],
  ] as const) {
    await expect(
      servicesCreate(staffCtx(env.base, "owner"), { ...ServicesCreateRequest.parse(body), photoFileId: f.id }),
    ).rejects.toMatchObject({ code });
    const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
    expect(file?.committedAt).toBeNull();
  }
  expect(await env.db.select().from(service)).toHaveLength(count);
});
it("rolls back service and file commitment when signing fails", async () => {
  const f = await photo();
  setStorage({
    ...storage,
    presignGet: async () => {
      throw new Error("signing failed");
    },
  });
  try {
    await expect(servicesCreate(staffCtx(env.base, "owner"), { ...ServicesCreateRequest.parse(body), photoFileId: f.id })).rejects.toThrow(
      "signing failed",
    );
  } finally {
    setStorage(storage);
  }
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).toBeNull();
  expect(await env.db.select().from(service).where(eq(service.photoFileId, f.id))).toHaveLength(0);
});
it("returns HTTP VALIDATION_FAILED for missing and invalid create fields", async () => {
  process.env.APP_BASE_URL = "https://petbooking.test";
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const POST = withStaff("services.create", { body: ServicesCreateRequest }, servicesCreate);
  for (const input of [
    {},
    { ...body, nameTh: "" },
    { ...body, category: "daycare_addon" },
    { ...body, addonPerDay: true },
    { ...body, estCostSatang: -1 },
    { ...body, photoFileId: "bad" },
  ]) {
    const response = await POST(
      new Request("https://petbooking.test/api/v1/staff/services", {
        method: "POST",
        headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
