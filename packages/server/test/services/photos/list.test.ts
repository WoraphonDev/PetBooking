import { PhotosListQuery, PhotosListRequest, PhotosListResponse } from "@app/contracts/endpoints/photos.list";
import { fileObject, pet, petPhoto } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { photosList } from "../../../src/services/photos/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let petId: string;
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  setStorage(createFakeStorage());
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Pet", species: "dog" })
    .returning();
  petId = p!.id;
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "before",
      storageKey: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "staff",
      committedAt: TEST_NOW,
    })
    .returning();
  for (const kind of ["before", "after", "before"] as const)
    await env.db.insert(petPhoto).values({ organizationId: env.base.orgId, petId, fileId: f!.id, kind, takenAt: TEST_NOW });
});
afterAll(async () => {
  setStorage(null);
  await env.close();
});
const input = () => ({ ...PhotosListRequest.parse({ petId }), ...PhotosListQuery.parse({ limit: 2 }) });
it.each(["owner", "front_desk", "staff"] as const)("lists signed photos for %s with stable pagination", async (role) => {
  const ctx = staffCtx(env.base, role);
  const first = PhotosListResponse.parse(await photosList(ctx, input()));
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).toBeTypeOf("string");
  const last = PhotosListResponse.parse(await photosList(ctx, { ...input(), cursor: first.nextCursor! }));
  expect(last.items).toHaveLength(1);
  expect(last.nextCursor).toBeNull();
  expect(new Set([...first.items, ...last.items].map((p) => p.id)).size).toBe(3);
  expect(first.items[0]!.url).toContain("photo.jpg?op=get");
});
it("filters kind and returns an empty page", async () => {
  const result = await photosList(staffCtx(env.base, "owner"), { ...input(), kind: "before", limit: 50 });
  expect(result.items).toHaveLength(2);
  expect(result.items.every((p) => p.kind === "before")).toBe(true);
  expect(await photosList(staffCtx(env.base, "owner"), { ...input(), kind: "stay" })).toEqual({ items: [], nextCursor: null });
});
it("validates params and pagination", async () => {
  expect(PhotosListRequest.safeParse({ petId: "bad" }).success).toBe(false);
  for (const query of [{ kind: "bad" }, { limit: 201 }, { limit: 0 }]) expect(PhotosListQuery.safeParse(query).success).toBe(false);
  await expect(photosList(staffCtx(env.base, "owner"), { ...input(), cursor: "broken" })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});
it("returns NOT_FOUND for another tenant and denies customer actors", async () => {
  await expect(photosList(staffCtx(foreign, "owner"), input())).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(photosList(customerCtx(env.base), input())).rejects.toMatchObject({ code: "FORBIDDEN" });
});
