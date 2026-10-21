import { ImportsCreateRequest, ImportsCreateResponse } from "@app/contracts/endpoints/imports.create";
import { fileObject, importJob, sizeTier } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { importsCreate, parseImportDate } from "../../../src/services/imports/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  await env.db.insert(sizeTier).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    species: "dog",
    code: "S",
    labelTh: "เล็ก",
    minWeightGrams: 0,
    maxWeightGrams: 5000,
  });
});
afterAll(async () => {
  setStorage(null);
  await env.close();
});
beforeEach(() => {
  storage = createFakeStorage();
  setStorage(storage);
});

let n = 0;
async function csvFile(body: string | Uint8Array | null, opts: { org?: SeedOrg; kind?: "import_csv" | "feedback" } = {}) {
  const org = opts.org ?? env.base;
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind: opts.kind ?? "import_csv",
      storageKey: `import-${++n}.csv`,
      mimeType: "text/csv",
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  if (!f) throw new Error("file fixture");
  if (body !== null) storage.put(f.storageKey, { sizeBytes: 100, contentType: "text/csv" }, body);
  return f.id;
}
const owner = () => staffCtx(env.base, "owner");

const CUSTOMERS = [
  "﻿customer_first_name,customer_last_name,nickname,phone,pet_name,species,breed,sex,birth_date,coat_type,weight_kg,note",
  'สมชาย,ใจดี,ชาย,081-234-5678,Milo,dog,Poodle,male,15/03/2563,curly,4.5,"แพ้แชมพู, ชอบกัด"',
  "Ann,,,0898765432,Lucy,CAT,,female,2021-01-31,short,,",
  "",
  ",Smith,,12345,,bird,,x,31/02/2020,fluffy,heavy,",
].join("\r\n");

it("validates every customers_pets row and stores a ready job (happy path, BOM, BE year)", async () => {
  const fileId = await csvFile(CUSTOMERS);
  const result = ImportsCreateResponse.parse(await importsCreate(owner(), ImportsCreateRequest.parse({ kind: "customers_pets", fileId })));
  expect(result).toMatchObject({ kind: "customers_pets", status: "ready", totalRows: 3, validRows: 2, errorRows: 1, committedAt: null });
  expect(result.errors.map((e) => [e.row, e.column, e.code])).toEqual([
    [5, "customer_first_name", "REQUIRED"],
    [5, "phone", "INVALID_PHONE"],
    [5, "pet_name", "REQUIRED"],
    [5, "species", "INVALID_ENUM"],
    [5, "sex", "INVALID_ENUM"],
    [5, "birth_date", "INVALID_DATE"],
    [5, "coat_type", "INVALID_ENUM"],
    [5, "weight_kg", "INVALID_NUMBER"],
  ]);
  expect(result.errors.every((e) => e.message.length > 0)).toBe(true);
  const [row] = await env.db.select().from(importJob).where(eq(importJob.id, result.id));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    kind: "customers_pets",
    fileId,
    status: "ready",
    totalRows: 3,
    validRows: 2,
    errorRows: 1,
    errors: result.errors,
    createdBy: env.base.staff.owner,
    committedAt: null,
    createdAt: TEST_NOW,
  });
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, fileId));
  expect(file?.committedAt).toEqual(TEST_NOW);
});

it("validates services rows: category/coat_group enums, size_code against the shop's tiers, numbers", async () => {
  const fileId = await csvFile(
    [
      "service_name,category,size_code,coat_group,price_baht,duration_minutes,colour",
      "อาบน้ำ,bath,s,short,350,60,red",
      "ตัดขน,haircut,,,1200.50,90,",
      "Spa,massage,XXL,curly,-5,1.5,",
      ",,,,,,",
    ].join("\n"),
  );
  const result = await importsCreate(owner(), { kind: "services", fileId });
  expect(result).toMatchObject({ totalRows: 3, validRows: 2, errorRows: 1 });
  expect(result.errors.map((e) => [e.row, e.column, e.code])).toEqual([
    [1, "colour", "UNKNOWN_COLUMN"],
    [4, "category", "INVALID_ENUM"],
    [4, "size_code", "INVALID_ENUM"],
    [4, "coat_group", "INVALID_ENUM"],
    [4, "price_baht", "INVALID_NUMBER"],
    [4, "duration_minutes", "INVALID_NUMBER"],
  ]);
});

it("marks every row REQUIRED when a required column is missing from the header", async () => {
  const fileId = await csvFile("service_name,category,price_baht\nอาบน้ำ,bath,100\n");
  const result = await importsCreate(owner(), { kind: "services", fileId });
  expect(result).toMatchObject({ totalRows: 1, validRows: 0, errorRows: 1 });
  expect(result.errors).toEqual([expect.objectContaining({ row: 2, column: "duration_minutes", code: "REQUIRED" })]);
});

it("parses dd/mm/yyyy and yyyy-mm-dd, converting Buddhist-era years", () => {
  expect(parseImportDate("15/03/2563")).toBe("2020-03-15");
  expect(parseImportDate("1/2/2021")).toBe("2021-02-01");
  expect(parseImportDate("2567-12-31")).toBe("2024-12-31");
  expect(parseImportDate("29/02/2023")).toBeNull();
  expect(parseImportDate("2020/01/01")).toBeNull();
});

it("rejects a missing or malformed field", () => {
  for (const body of [{ kind: "customers_pets" }, { fileId: "x" }, { kind: "pets", fileId: crypto.randomUUID() }, {}])
    expect(ImportsCreateRequest.safeParse(body).success).toBe(false);
});

it("rejects a non-import_csv file and non-UTF-8 bytes with VALIDATION_FAILED", async () => {
  const wrongKind = await csvFile("a", { kind: "feedback" });
  await expect(importsCreate(owner(), { kind: "services", fileId: wrongKind })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  const latin1 = await csvFile(new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0xe9, 0xff]));
  await expect(importsCreate(owner(), { kind: "services", fileId: latin1 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await env.db.select().from(importJob).where(eq(importJob.fileId, latin1))).toEqual([]);
});

it("answers FILE_NOT_UPLOADED before the PUT happened", async () => {
  const fileId = await csvFile(null);
  await expect(importsCreate(owner(), { kind: "services", fileId })).rejects.toMatchObject({ code: "FILE_NOT_UPLOADED" });
});

it("denies front_desk and staff", async () => {
  const fileId = await csvFile(CUSTOMERS);
  for (const role of ["front_desk", "staff"] as const)
    await expect(importsCreate(staffCtx(env.base, role), { kind: "customers_pets", fileId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
});

it("answers NOT_FOUND for another organization's file", async () => {
  const fileId = await csvFile(CUSTOMERS, { org: foreign });
  await expect(importsCreate(owner(), { kind: "customers_pets", fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
