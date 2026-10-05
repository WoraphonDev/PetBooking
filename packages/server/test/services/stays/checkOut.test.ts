import { StaysCheckOutParams, StaysCheckOutRequest, StaysCheckOutResponse } from "@app/contracts/endpoints/stays.checkOut";
import { bill, billLine, booking, bookingEvent, careTask, pet, reportCard, roomType, roomUnit, stay, stayBelonging } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysCheckOut } from "../../../src/services/stays/checkOut.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.checkOut", { body: StaysCheckOutRequest, params: StaysCheckOutParams }, staysCheckOut);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a checked-in 2-night stay (600/night) with two belongings and a pending + a done care task */
async function seedStay(
  opts: { status?: typeof stay.$inferInsert.status; bookingStatus?: typeof booking.$inferInsert.status } = {},
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
      status: opts.bookingStatus ?? "confirmed",
      policySnapshot: {},
      estimatedTotalSatang: 120_000,
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
      checkInDate: "2026-10-03",
      checkOutDate: "2026-10-05",
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
      status: opts.status ?? "checked_in",
      checkedInAt: new Date("2026-10-03T03:00:00Z"),
    })
    .returning();
  const items = await env.db
    .insert(stayBelonging)
    .values([
      { organizationId: org.orgId, stayId: s?.id ?? "", item: "ผ้าห่ม" },
      { organizationId: org.orgId, stayId: s?.id ?? "", item: "ตุ๊กตา" },
    ])
    .returning();
  await env.db.insert(careTask).values([
    { ...tenant, stayId: s?.id ?? "", taskType: "feed", title: "ให้อาหาร", dueAt: new Date("2026-10-04T01:00:00Z"), status: "done" },
    { ...tenant, stayId: s?.id ?? "", taskType: "feed", title: "ให้อาหาร", dueAt: new Date("2026-10-05T11:00:00Z") },
  ]);
  return { id: s?.id ?? "", bookingId: bk?.id ?? "", unitId: u?.id ?? "", belongings: items.map((b) => b.id) };
}
async function checkOut(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/check-out`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const stayRow = async (id: string) => (await env.db.select().from(stay).where(eq(stay.id, id)))[0];

it("everything returned: checked out, room dirty, pending tasks skipped, stay report card draft, bill opened with the stay line", async () => {
  const s = await seedStay();
  const res = await checkOut(s.id, { weightGramsOut: 5100, returnedBelongingIds: s.belongings });
  expect(res.status).toBe(200);
  const d = StaysCheckOutResponse.parse(await res.json());
  expect(d.stay.status).toBe("checked_out");
  expect(d).toMatchObject({ weightGramsOut: 5100, checkedOutAt: expect.any(String) });
  expect(d.belongings.every((b) => b.returnedAt !== null)).toBe(true);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, s.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["checked_in", "checked_out"]]);
  expect((await env.db.select().from(roomUnit).where(eq(roomUnit.id, s.unitId)))[0]?.housekeeping).toBe("dirty");
  expect((await env.db.select().from(careTask).where(eq(careTask.stayId, s.id))).map((t) => t.status).sort()).toEqual(["done", "skipped"]);
  const cards = await env.db.select().from(reportCard).where(eq(reportCard.stayId, s.id));
  expect(cards).toEqual([
    expect.objectContaining({ kind: "stay", status: "draft", customerId: env.base.customerId, createdBy: env.base.staff.front_desk }),
  ]);
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, s.bookingId));
  expect(bk?.billId).toBeTruthy();
  const lines = await env.db
    .select()
    .from(billLine)
    .where(eq(billLine.billId, bk?.billId ?? ""));
  expect(lines).toEqual([
    expect.objectContaining({ refType: "stay", refId: s.id, lineType: "stay_night", quantity: 2, lineTotalSatang: 120_000 }),
  ]);
  expect(
    (
      await env.db
        .select()
        .from(bill)
        .where(eq(bill.id, bk?.billId ?? ""))
    )[0],
  ).toMatchObject({ status: "open", totalSatang: 120_000 });
});

it("a missing belonging needs missingNote (VALIDATION_FAILED without); with it the stay checks out and the item stays unreturned", async () => {
  const s = await seedStay();
  expect(await codeOf(await checkOut(s.id, { returnedBelongingIds: [s.belongings[0]] }))).toBe("VALIDATION_FAILED");
  expect((await stayRow(s.id))?.status).toBe("checked_in");
  expect((await checkOut(s.id, { returnedBelongingIds: [s.belongings[0]], missingNote: "ตุ๊กตาหาย ร้านรับผิดชอบ" }, "owner")).status).toBe(200);
  const items = await env.db.select().from(stayBelonging).where(eq(stayBelonging.stayId, s.id));
  expect(items.find((b) => b.id === s.belongings[1])?.returnedAt).toBeNull();
});

it("an existing open bill is kept (no second bill); a booking that is not confirmed gets none", async () => {
  const s = await seedStay();
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      openedBy: env.base.staff.owner,
      status: "open",
    })
    .returning();
  await env.db.update(booking).set({ billId: b?.id }).where(eq(booking.id, s.bookingId));
  await checkOut(s.id, { returnedBelongingIds: s.belongings });
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]?.billId).toBe(b?.id);
  const closed = await seedStay({ bookingStatus: "closed" });
  expect((await checkOut(closed.id, { returnedBelongingIds: closed.belongings })).status).toBe(200);
  expect((await env.db.select().from(booking).where(eq(booking.id, closed.bookingId)))[0]?.billId).toBeNull();
});

it("a belonging of another stay → VALIDATION_FAILED; not checked in → INVALID_TRANSITION", async () => {
  const a = await seedStay();
  const b = await seedStay();
  expect(await codeOf(await checkOut(a.id, { returnedBelongingIds: [...a.belongings, b.belongings[0]] }))).toBe("VALIDATION_FAILED");
  for (const status of ["reserved", "checked_out"] as const) {
    const s = await seedStay({ status });
    expect(await codeOf(await checkOut(s.id, { returnedBelongingIds: s.belongings }))).toBe("INVALID_TRANSITION");
  }
});

it("bad body → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const s = await seedStay();
  expect(await codeOf(await checkOut(s.id, {}))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await checkOut(s.id, { returnedBelongingIds: s.belongings }, "staff"))).toBe("FORBIDDEN");
  const foreign = await seedStay({}, other);
  expect(await codeOf(await checkOut(foreign.id, { returnedBelongingIds: foreign.belongings }))).toBe("NOT_FOUND");
});
