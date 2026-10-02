import { randomUUID } from "node:crypto";
import { booking, bookingEvent, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withTx } from "../../src/db.ts";
import * as events from "../../src/events.ts";
import { transition } from "../../src/state.ts";
import { otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await env.close();
});
async function seedBooking() {
  const [row] = await env.db
    .insert(booking)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      channel: "walk_in",
      bookingNo: "B6910-0001",
      createdByType: "staff",
      policySnapshot: {},
      status: "confirmed",
      depositStatus: "pending",
    })
    .returning();
  if (!row) throw new Error("Expected booking");
  return row;
}
it("updates booking status and writes the actual previous state in the same transaction", async () => {
  const row = await seedBooking();
  const ctx = staffCtx(env.base, "owner");
  const updated = await withTx(ctx, (tx) =>
    transition(tx, ctx, { table: booking, id: row.id, machine: "booking", to: "cancelled", reason: "shop cancel" }),
  );
  expect(updated).toMatchObject({ status: "cancelled", updatedAt: TEST_NOW });
  expect(await env.db.select().from(bookingEvent)).toMatchObject([
    {
      organizationId: env.base.orgId,
      bookingId: row.id,
      entityType: "booking",
      entityId: row.id,
      fromStatus: "confirmed",
      toStatus: "cancelled",
      reason: "shop cancel",
      actorType: "staff",
      actorId: ctx.actor.id,
      createdAt: TEST_NOW,
    },
  ]);
});
it("uses deposit_status for the deposit machine and leaves booking status unchanged", async () => {
  const row = await seedBooking();
  const ctx = staffCtx(env.base, "owner");
  await withTx(ctx, (tx) => transition(tx, ctx, { table: booking, id: row.id, machine: "deposit", to: "verified" }));
  expect(await env.db.select().from(booking)).toMatchObject([{ status: "confirmed", depositStatus: "verified" }]);
  expect(await env.db.select().from(bookingEvent)).toMatchObject([{ entityType: "deposit", fromStatus: "pending", toStatus: "verified" }]);
});
it("transitions non-booking machines without a booking event and applies extra fields", async () => {
  const ctx = staffCtx(env.base, "owner");
  await withTx(ctx, (tx) =>
    transition(tx, ctx, {
      table: staffUser,
      id: env.base.staff.staff,
      machine: "staff_user",
      to: "disabled",
      extraSet: { displayName: "Updated" },
    }),
  );
  expect(await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.staff))).toMatchObject([
    { status: "disabled", displayName: "Updated", updatedAt: TEST_NOW },
  ]);
  expect(await env.db.select().from(bookingEvent)).toHaveLength(0);
});
it("rejects invalid transitions without modifying the row or appending events", async () => {
  const row = await seedBooking();
  const ctx = staffCtx(env.base, "owner");
  for (const to of ["expired", "confirmed"]) {
    await expect(withTx(ctx, (tx) => transition(tx, ctx, { table: booking, id: row.id, machine: "booking", to }))).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  }
  expect(await env.db.select().from(booking)).toMatchObject([{ status: "confirmed" }]);
  expect(await env.db.select().from(bookingEvent)).toHaveLength(0);
});
it("returns NOT_FOUND for another tenant or a missing row, with no writes", async () => {
  const row = await seedBooking();
  const foreign = await otherOrg(env.db);
  const ctx = staffCtx(foreign, "owner");
  for (const id of [row.id, randomUUID()]) {
    await expect(
      withTx(ctx, (tx) => transition(tx, ctx, { table: booking, id, machine: "booking", to: "cancelled" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(
    withTx(ctx, (tx) =>
      events.writeBookingEvent(tx, ctx, { bookingId: row.id, entityType: "booking", entityId: row.id, from: null, to: "confirmed" }),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await env.db.select().from(bookingEvent)).toHaveLength(0);
  expect(await env.db.select().from(booking)).toMatchObject([{ status: "confirmed" }]);
});
it("rolls back status if event writing fails, and rolls back events on a later failure", async () => {
  const row = await seedBooking();
  const ctx = staffCtx(env.base, "owner");
  vi.spyOn(events, "writeBookingEvent").mockRejectedValueOnce(new Error("event failed"));
  await expect(
    withTx(ctx, (tx) => transition(tx, ctx, { table: booking, id: row.id, machine: "booking", to: "cancelled" })),
  ).rejects.toThrow("event failed");
  vi.restoreAllMocks();
  await expect(
    withTx(ctx, async (tx) => {
      await transition(tx, ctx, { table: booking, id: row.id, machine: "booking", to: "cancelled" });
      throw new Error("later failure");
    }),
  ).rejects.toThrow("later failure");
  expect(await env.db.select().from(booking)).toMatchObject([{ status: "confirmed" }]);
  expect(await env.db.select().from(bookingEvent)).toHaveLength(0);
});
