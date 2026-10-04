import { CareTasksDoneParams, CareTasksDoneRequest, CareTasksDoneResponse } from "@app/contracts/endpoints/careTasks.done";
import { booking, careTask, fileObject, pet, roomType, roomUnit, stay, stayMedication } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { careTasksDone } from "../../../src/services/careTasks/done.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("careTasks.done", { body: CareTasksDoneRequest, params: CareTasksDoneParams }, careTasksDone);
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
const done = (taskId: string, body: unknown = {}) => call(`/api/v1/staff/care-tasks/${taskId}/done`, { taskId }, body);

it("pending → done with done_at, done_by, note and a committed photo (role staff)", async () => {
  const s = await seedStay([["feed", "ให้อาหาร", "2026-10-05T01:00:00Z"]]);
  const photo = await upload();
  const res = await done(s.tasks[0] ?? "", { note: "กินหมด", photoFileId: photo });
  expect(res.status).toBe(200);
  const item = CareTasksDoneResponse.parse(await res.json());
  expect(item).toMatchObject({
    id: s.tasks[0],
    status: "done",
    note: "กินหมด",
    photoUrl: expect.any(String),
    doneByName: expect.any(String),
    petName: s.petName,
  });
  const row = await taskRow(s.tasks[0] ?? "");
  expect(row).toMatchObject({ status: "done", doneBy: env.base.staff.staff, note: "กินหมด", photoFileId: photo });
  expect(row?.doneAt).toBeInstanceOf(Date);
  expect((await env.db.select().from(fileObject).where(eq(fileObject.id, photo)))[0]?.committedAt).not.toBeNull();
});

it("without note or photo; an already done / skipped task → INVALID_TRANSITION", async () => {
  const s = await seedStay([
    ["walk", "เดิน", "2026-10-05T09:00:00Z"],
    ["walk", "เดิน", "2026-10-05T10:00:00Z", "done"],
    ["walk", "เดิน", "2026-10-05T11:00:00Z", "skipped"],
  ]);
  expect(CareTasksDoneResponse.parse(await (await done(s.tasks[0] ?? "")).json())).toMatchObject({ note: null, photoUrl: null });
  for (const id of s.tasks.slice(1)) expect(await codeOf(await done(id))).toBe("INVALID_TRANSITION");
});

it("a photo of another kind or a long note → VALIDATION_FAILED; another org's task → NOT_FOUND", async () => {
  const s = await seedStay([["feed", "ให้อาหาร", "2026-10-05T01:00:00Z"]]);
  expect(await codeOf(await done(s.tasks[0] ?? "", { photoFileId: await upload("slip") }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await done(s.tasks[0] ?? "", { note: "ก".repeat(201) }))).toBe("VALIDATION_FAILED");
  expect((await taskRow(s.tasks[0] ?? ""))?.status).toBe("pending");
  const foreign = await seedStay([["feed", "ร้านอื่น", "2026-10-05T01:00:00Z"]], other);
  expect(await codeOf(await done(foreign.tasks[0] ?? ""))).toBe("NOT_FOUND");
});
