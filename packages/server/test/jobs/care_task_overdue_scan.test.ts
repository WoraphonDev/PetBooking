import { booking, careTask, notification, pet, roomType, roomUnit, scheduledJob, staffUser, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/care_task_overdue_scan.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());

const ago = (minutes: number) => new Date(TEST_NOW.getTime() - minutes * 60_000);

async function seedStay(org: SeedOrg, code: string) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: `B-${code}`,
      createdByType: "staff",
      policySnapshot: {},
      status: "confirmed",
      depositStatus: "not_required",
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "มะลิ", species: "dog" })
    .returning();
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code })
    .returning();
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      roomTypeId: type?.id ?? "",
      roomUnitId: unit?.id ?? "",
      checkInDate: "2026-10-04",
      checkOutDate: "2026-10-06",
      nights: 2,
      nightlyPriceSatang: 50000,
      roomTotalSatang: 100000,
      status: "checked_in",
    })
    .returning();
  return { ...tenant, stayId: s?.id ?? "", taskType: "feed" as const };
}

const notified = (taskId: string) =>
  env.db
    .select()
    .from(notification)
    .then((rows) => rows.filter((r) => r.dedupeKey.startsWith(`care_overdue:${taskId}:`)));

it("notifies every active staff once per overdue pending task, in each organization", async () => {
  const [disabled] = await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, displayName: "gone", role: "staff", status: "disabled" })
    .returning();
  const base = await seedStay(env.base, "A1");
  const [overdue, boundary, recent, done] = await env.db
    .insert(careTask)
    .values([
      { ...base, title: "ให้อาหารเช้า", dueAt: ago(31) },
      { ...base, title: "ให้ยา", dueAt: ago(30) },
      { ...base, title: "พาเดิน", dueAt: ago(5) },
      { ...base, title: "แปรงขน", dueAt: ago(90), status: "done", doneAt: ago(60) },
    ])
    .returning();
  const foreignBase = await seedStay(other, "B1");
  const [foreign] = await env.db
    .insert(careTask)
    .values({ ...foreignBase, title: "ให้น้ำ", dueAt: ago(45) })
    .returning();
  await env.db.insert(scheduledJob).values({
    organizationId: null,
    jobType: "care_task_overdue_scan",
    runAt: TEST_NOW,
    payload: {},
    dedupeKey: "care_task_overdue_scan:202610051000/15",
  });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { care_task_overdue_scan: handler })).toEqual({ processed: 1, failed: 0 });

  const rows = await notified(overdue?.id ?? "");
  expect(rows.map((r) => r.recipientId).sort()).toEqual(Object.values(env.base.staff).sort());
  expect(rows.map((r) => r.recipientId)).not.toContain(disabled?.id);
  expect(rows[0]).toMatchObject({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    recipientType: "staff",
    templateKey: "staff.care_task_overdue",
    payload: { title: "ให้อาหารเช้า", petName: "มะลิ", roomCode: "A1" },
    status: "queued",
  });
  for (const t of [boundary, recent, done]) expect(await notified(t?.id ?? "")).toHaveLength(0);
  const foreignRows = await notified(foreign?.id ?? "");
  expect(foreignRows.map((r) => [r.organizationId, r.recipientId].join()).sort()).toEqual(
    Object.values(other.staff)
      .map((id) => [other.orgId, id].join())
      .sort(),
  );

  // the next 15-minute scan does not notify the same task again
  const later = makeSystemCtx(null, new Date(TEST_NOW.getTime() + 15 * 60_000));
  await withTx(later, (tx) => handler(tx, later, {} as never));
  expect(await notified(overdue?.id ?? "")).toHaveLength(3);
  expect(await notified(boundary?.id ?? "")).toHaveLength(3);
  expect(
    await env.db
      .select()
      .from(careTask)
      .where(eq(careTask.id, overdue?.id ?? "")),
  ).toMatchObject([{ status: "pending" }]);
});
