import { fileObject } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { withTx } from "../../src/db.ts";
import { commitFile, createUploadTicket, signedUrl, storageKeyFor } from "../../src/files.ts";
import { createFakeStorage, setStorage } from "../../src/integrations/storage/index.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  setStorage(null);
  await env.close();
});
beforeEach(async () => {
  storage = createFakeStorage();
  setStorage(storage);
  await env.db.delete(fileObject);
});

const owner = () => staffCtx(env.base, "owner");
const photo = { kind: "before" as const, mimeType: "image/webp", sizeBytes: 300_000, width: 1600, height: 1200 };
const ticket = (ctx = owner(), input: Parameters<typeof createUploadTicket>[2] = photo) =>
  withTx(ctx, (tx) => createUploadTicket(tx, ctx, input));
const rowOf = async (id: string) => (await env.db.select().from(fileObject).where(eq(fileObject.id, id)))[0];

it("builds the R-25 storage key org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}", () => {
  expect(storageKeyFor("o1", "slip", "image/jpeg", "f1", TEST_NOW)).toBe("org/o1/slip/2026/10/f1.jpg");
  expect(storageKeyFor("o1", "vaccine_proof", "application/pdf", "f2", new Date("2026-01-31T23:00:00Z"))).toBe(
    "org/o1/vaccine_proof/2026/01/f2.pdf",
  );
});

it("creates an uncommitted file_object and a presigned PUT signed for its type and size", async () => {
  const t = await ticket();
  expect(t.storageKey).toBe(`org/${env.base.orgId}/before/2026/10/${t.fileId}.webp`);
  expect(t.headers).toEqual({ "Content-Type": "image/webp" });
  expect(t.uploadUrl).toBe(`https://storage.test/${t.storageKey}?op=put&size=300000&expires=300`);
  expect(await rowOf(t.fileId)).toMatchObject({
    organizationId: env.base.orgId,
    kind: "before",
    mimeType: "image/webp",
    sizeBytes: 300_000,
    width: 1600,
    height: 1200,
    uploadedByType: "staff",
    uploadedById: env.base.staff.owner,
    committedAt: null,
    deletedAt: null,
    createdAt: TEST_NOW,
  });
});

it("records a customer uploader and lower-cases the MIME type", async () => {
  const t = await ticket(customerCtx(env.base), { kind: "slip", mimeType: "IMAGE/JPEG", sizeBytes: 1000 });
  expect(t.headers).toEqual({ "Content-Type": "image/jpeg" });
  expect(await rowOf(t.fileId)).toMatchObject({ uploadedByType: "customer", uploadedById: env.base.customerId, mimeType: "image/jpeg" });
});

it.each([
  [{ kind: "slip" as const, mimeType: "video/mp4", sizeBytes: 1000 }, "UPLOAD_TYPE_NOT_ALLOWED"],
  [{ kind: "before" as const, mimeType: "image/png", sizeBytes: 2_000_001 }, "UPLOAD_TOO_LARGE"],
  [{ kind: "signature" as const, mimeType: "image/png", sizeBytes: 0 }, "UPLOAD_TOO_LARGE"],
])("rejects %j with %s and creates nothing", async (input, code) => {
  await expect(ticket(owner(), input)).rejects.toMatchObject({ code });
  expect(await env.db.select().from(fileObject)).toEqual([]);
});

it("commits an uploaded file of the expected kind once (HEAD must find the object)", async () => {
  const t = await ticket();
  await expect(withTx(owner(), (tx) => commitFile(tx, owner(), t.fileId, "before"))).rejects.toMatchObject({ code: "FILE_NOT_UPLOADED" });
  expect((await rowOf(t.fileId))?.committedAt).toBeNull();

  storage.put(t.storageKey, { sizeBytes: 300_000, contentType: "image/webp" });
  const later = { ...owner(), now: new Date(TEST_NOW.getTime() + 60_000) };
  const committed = await withTx(later, (tx) => commitFile(tx, later, t.fileId, "before"));
  expect(committed.committedAt).toEqual(later.now);
  expect((await rowOf(t.fileId))?.committedAt).toEqual(later.now);

  // already committed → unchanged, even if the object check would fail now
  storage.objects.clear();
  const again = { ...owner(), now: new Date(TEST_NOW.getTime() + 120_000) };
  expect((await withTx(again, (tx) => commitFile(tx, again, t.fileId, "before"))).committedAt).toEqual(later.now);
});

it("refuses a file of another kind with VALIDATION_FAILED", async () => {
  const t = await ticket();
  storage.put(t.storageKey, { sizeBytes: 300_000, contentType: "image/webp" });
  await expect(withTx(owner(), (tx) => commitFile(tx, owner(), t.fileId, "slip"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect((await rowOf(t.fileId))?.committedAt).toBeNull();
});

it("treats another org's file, a deleted file and an unknown id as NOT_FOUND", async () => {
  const t = await ticket();
  storage.put(t.storageKey, { sizeBytes: 300_000, contentType: "image/webp" });
  const stranger = staffCtx(other, "owner");
  await expect(withTx(stranger, (tx) => commitFile(tx, stranger, t.fileId, "before"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(signedUrl(env.db, stranger, t.fileId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(signedUrl(env.db, owner(), "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });

  await env.db.update(fileObject).set({ deletedAt: TEST_NOW }).where(eq(fileObject.id, t.fileId));
  await expect(withTx(owner(), (tx) => commitFile(tx, owner(), t.fileId, "before"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(signedUrl(env.db, owner(), t.fileId)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("gives a one-hour signed GET for a file of the caller's org", async () => {
  const t = await ticket();
  expect(await signedUrl(env.db, owner(), t.fileId)).toBe(`https://storage.test/${t.storageKey}?op=get&expires=3600`);
});
