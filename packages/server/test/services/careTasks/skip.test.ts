import { CareTasksSkipParams, CareTasksSkipRequest, CareTasksSkipResponse } from "@app/contracts/endpoints/careTasks.skip";
import { booking, careTask, fileObject, pet, roomType, roomUnit, stay, stayMedication } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { careTasksSkip } from "../../../src/services/careTasks/skip.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("careTasks.skip", { body: CareTasksSkipRequest, params: CareTasksSkipParams }, careTasksSkip);
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
const skip = (taskId: string, body: unknown) => call(`/api/v1/staff/care-tasks/${taskId}/skip`, { taskId }, body);

it("pending → skipped with the reason in note (role staff)", async () => {
  const s = await seedStay([["walk", "พาเดินเล่น", "2026-10-05T09:00:00Z"]]);
  const res = await skip(s.tasks[0] ?? "", { note: "ฝนตก" });
  expect(res.status).toBe(200);
  expect(CareTasksSkipResponse.parse(await res.json())).toMatchObject({ id: s.tasks[0], status: "skipped", note: "ฝนตก", doneAt: null });
  expect(await taskRow(s.tasks[0] ?? "")).toMatchObject({ status: "skipped", note: "ฝนตก", doneAt: null, doneBy: null });
});

it("a done / skipped task → INVALID_TRANSITION", async () => {
  const s = await seedStay([
    ["walk", "เดิน", "2026-10-05T10:00:00Z", "done"],
    ["walk", "เดิน", "2026-10-05T11:00:00Z", "skipped"],
  ]);
  for (const id of s.tasks) expect(await codeOf(await skip(id, { note: "ฝนตก" }))).toBe("INVALID_TRANSITION");
});

it.each([
  ["missing note", {}],
  ["note shorter than 3", { note: "ab" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  const s = await seedStay([["walk", "เดิน", "2026-10-05T09:00:00Z"]]);
  expect(await codeOf(await skip(s.tasks[0] ?? "", body))).toBe("VALIDATION_FAILED");
});

it("another org's task → NOT_FOUND", async () => {
  const foreign = await seedStay([["walk", "ร้านอื่น", "2026-10-05T09:00:00Z"]], other);
  expect(await codeOf(await skip(foreign.tasks[0] ?? "", { note: "ฝนตก" }))).toBe("NOT_FOUND");
  void upload;
});
