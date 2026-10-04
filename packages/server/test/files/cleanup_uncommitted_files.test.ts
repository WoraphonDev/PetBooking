import { fileObject } from "@app/db/schema";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { createFakeStorage, setStorage } from "../../src/integrations/storage/index.ts";
import { handler } from "../../src/jobs/handlers/cleanup_uncommitted_files.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

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

const HOUR = 3_600_000;
async function file(orgId: string | null, key: string, hoursAgo: number, extra: Partial<typeof fileObject.$inferInsert> = {}) {
  storage.put(key, { sizeBytes: 10, contentType: "image/jpeg" });
  await env.db.insert(fileObject).values({
    organizationId: orgId,
    kind: "before",
    storageKey: key,
    mimeType: "image/jpeg",
    sizeBytes: 10,
    uploadedByType: "staff",
    createdAt: new Date(TEST_NOW.getTime() - hoursAgo * HOUR),
    ...extra,
  });
}
const run = (now = TEST_NOW) => withTx(makeSystemCtx(null, now), (tx) => handler(tx, makeSystemCtx(null, now), {} as never));
const rows = () =>
  env.db.select({ key: fileObject.storageKey, deletedAt: fileObject.deletedAt }).from(fileObject).orderBy(asc(fileObject.storageKey));

it("deletes objects uncommitted for more than 24 h in every org, then marks deleted_at", async () => {
  await file(env.base.orgId, "a-old", 25);
  await file(other.orgId, "b-old", 48);
  await file(null, "c-platform-old", 30);
  await file(env.base.orgId, "d-fresh", 23);
  await file(env.base.orgId, "e-exactly-24h", 24);
  await file(env.base.orgId, "f-committed", 72, { committedAt: new Date(TEST_NOW.getTime() - 71 * HOUR) });

  await run();

  expect(await rows()).toEqual([
    { key: "a-old", deletedAt: TEST_NOW },
    { key: "b-old", deletedAt: TEST_NOW },
    { key: "c-platform-old", deletedAt: TEST_NOW },
    { key: "d-fresh", deletedAt: null },
    { key: "e-exactly-24h", deletedAt: null },
    { key: "f-committed", deletedAt: null },
  ]);
  expect([...storage.objects.keys()].sort()).toEqual(["d-fresh", "e-exactly-24h", "f-committed"]);
});

it("is idempotent: a second run leaves deleted rows untouched", async () => {
  await file(env.base.orgId, "a-old", 25);
  await run();
  const later = new Date(TEST_NOW.getTime() + HOUR);
  await run(later);
  expect(await rows()).toEqual([{ key: "a-old", deletedAt: TEST_NOW }]);
});
