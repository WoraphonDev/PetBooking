import { CareTasksListQuery, CareTasksListResponse } from "@app/contracts/endpoints/careTasks.list";
import { booking, careTask, fileObject, pet, roomType, roomUnit, stay, stayMedication } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { careTasksList } from "../../../src/services/careTasks/list.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("careTasks.list", { query: CareTasksListQuery }, careTasksList);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
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

async function upload(kind: typeof fileObject.$inferInsert.kind = "stay_update") {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind,
      storageKey: `org/x/${kind}/c${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: "image/jpeg" });
  return f?.id ?? "";
}
/** a checked-in stay in its own room with a medication; tasks given as [type, title, dueAt ISO, status?] */
async function seedStay(
  tasks: [typeof careTask.$inferInsert.taskType, string, string, ("pending" | "done" | "skipped")?][],
  org: SeedOrg = env.base,
) {
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
      checkInDate: "2026-10-04",
      checkOutDate: "2026-10-07",
      nights: 3,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 180_000,
      status: "checked_in",
    })
    .returning();
  const [med] = await env.db
    .insert(stayMedication)
    .values({ organizationId: org.orgId, stayId: s?.id ?? "", name: "ยาหยอดหู", dose: "2 หยด", times: ["09:00"] })
    .returning();
  const rows = tasks.length
    ? await env.db
        .insert(careTask)
        .values(
          tasks.map(([taskType, title, dueAt, status]) => ({
            ...tenant,
            stayId: s?.id ?? "",
            taskType,
            title,
            dueAt: new Date(dueAt),
            status: status ?? "pending",
            medicationId: taskType === "medication" ? med?.id : null,
          })),
        )
        .returning()
    : [];
  return { id: s?.id ?? "", code: u?.code ?? "", petName: p?.name ?? "", tasks: rows.map((r) => r.id) };
}
async function call(url: string, params: Record<string, string>, body?: unknown, role: "owner" | "front_desk" | "staff" = "staff") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const taskRow = async (id: string) => (await env.db.select().from(careTask).where(eq(careTask.id, id)))[0];
const list = async (query: string) => {
  const res = await call(`/api/v1/staff/care-tasks${query}`, {});
  expect(res.status).toBe(200);
  return CareTasksListResponse.parse(await res.json());
};

it("lists the tasks due on the branch-local date in due order, with pet, room, medication and done-by (role staff)", async () => {
  // 2026-10-05 in Bangkok = [2026-10-04T17:00Z, 2026-10-05T17:00Z)
  const s = await seedStay([
    ["feed", "ให้อาหาร", "2026-10-05T11:00:00Z"],
    ["medication", "ให้ยา", "2026-10-05T02:00:00Z", "done"],
    ["walk", "พาเดินเล่น", "2026-10-04T17:00:00Z"],
    ["feed", "ให้อาหาร", "2026-10-04T16:59:00Z"],
    ["clean", "ทำความสะอาด", "2026-10-05T17:00:00Z"],
  ]);
  await env.db
    .update(careTask)
    .set({ doneBy: env.base.staff.front_desk, doneAt: new Date("2026-10-05T02:05:00Z") })
    .where(eq(careTask.id, s.tasks[1] ?? ""));
  const items = await list("?date=2026-10-05");
  expect(items.map((i) => [i.title, i.status])).toEqual([
    ["พาเดินเล่น", "pending"],
    ["ให้ยา", "done"],
    ["ให้อาหาร", "pending"],
  ]);
  expect(items[1]).toMatchObject({
    stayId: s.id,
    petName: s.petName,
    roomCode: s.code,
    medication: "ยาหยอดหู 2 หยด",
    doneByName: expect.any(String),
    photoUrl: null,
  });
  expect(items[0]).toMatchObject({ medication: null, doneByName: null, doneAt: null });
});

it("filters by status and stay; other orgs' tasks never show", async () => {
  const a = await seedStay([
    ["feed", "เช้า", "2026-10-08T01:00:00Z"],
    ["walk", "เดิน", "2026-10-08T09:00:00Z", "skipped"],
  ]);
  const b = await seedStay([["feed", "เช้า", "2026-10-08T01:30:00Z"]]);
  await seedStay([["feed", "ร้านอื่น", "2026-10-08T01:00:00Z"]], other);
  expect((await list("?date=2026-10-08")).map((i) => i.stayId)).toEqual([a.id, b.id, a.id]);
  expect((await list("?date=2026-10-08&status=skipped")).map((i) => i.title)).toEqual(["เดิน"]);
  expect((await list(`?date=2026-10-08&stayId=${b.id}`)).map((i) => i.stayId)).toEqual([b.id]);
});

it.each([
  ["missing date", ""],
  ["bad status", "?date=2026-10-05&status=late"],
  ["bad stay id", "?date=2026-10-05&stayId=x"],
])("VALIDATION_FAILED: %s", async (_n, query) => {
  expect(await codeOf(await call(`/api/v1/staff/care-tasks${query}`, {}))).toBe("VALIDATION_FAILED");
  void upload;
  void taskRow;
});
