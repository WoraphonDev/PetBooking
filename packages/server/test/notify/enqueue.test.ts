// T-0010: enqueueNotification — outbox row, local month key, per-recipient dedupe.
import { notification, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTx } from "../../src/db.ts";
import { enqueueNotification, localMonthKey } from "../../src/notify/enqueue.ts";
import { setupTestDb, staffCtx, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());

describe("localMonthKey", () => {
  it("uses the branch timezone, not UTC", () => {
    expect(localMonthKey(new Date("2026-09-30T18:00:00.000Z"), "Asia/Bangkok")).toBe("2026-10");
    expect(localMonthKey(new Date("2026-09-30T16:59:59.000Z"), "Asia/Bangkok")).toBe("2026-09");
  });
});

describe("enqueueNotification", () => {
  it("inserts a queued row in the caller's transaction", async () => {
    const ctx = staffCtx(env.base, "front_desk");
    const row = await withTx(ctx, (tx) =>
      enqueueNotification(tx, ctx, {
        key: "customer.deposit_confirmed",
        recipient: { type: "customer", id: env.base.customerId },
        payload: { bookingNo: "B-0001", amount: "฿200" },
        dedupeKey: "deposit_confirmed:b1",
      }),
    );
    expect(row).toMatchObject({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      channel: "line_push",
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.deposit_confirmed",
      payload: { bookingNo: "B-0001", amount: "฿200" },
      dedupeKey: `deposit_confirmed:b1:${env.base.customerId}`,
      monthKey: "2026-10",
      status: "queued",
      skipReason: null,
      sentAt: null,
    });
  });

  it("same event + recipient → no-op (null); another recipient → its own row", async () => {
    const ctx = staffCtx(env.base, "owner");
    const enqueue = (id: string) =>
      withTx(ctx, (tx) =>
        enqueueNotification(tx, ctx, {
          key: "staff.new_booking",
          recipient: { type: "staff", id },
          payload: { bookingNo: "B-0002", customerName: "คุณเอ", summary: "อาบน้ำ" },
          dedupeKey: "new_booking:b2",
        }),
      );
    expect(await enqueue(env.base.staff.owner)).not.toBeNull();
    expect(await enqueue(env.base.staff.owner)).toBeNull();
    expect(await enqueue(env.base.staff.front_desk)).not.toBeNull();
    const rows = await env.db.select().from(notification).where(eq(notification.templateKey, "staff.new_booking"));
    expect(rows.map((r) => r.dedupeKey).sort()).toEqual(
      [`new_booking:b2:${env.base.staff.owner}`, `new_booking:b2:${env.base.staff.front_desk}`].sort(),
    );
  });

  it("rolls back with the caller's transaction (outbox)", async () => {
    const ctx = staffCtx(env.base, "owner");
    await expect(
      withTx(ctx, async (tx) => {
        await enqueueNotification(tx, ctx, {
          key: "customer.link_approved",
          recipient: { type: "customer", id: env.base.customerId },
          payload: { shopName: "Shop a" },
          dedupeKey: "link_approved:rollback",
        });
        throw new Error("service failed");
      }),
    ).rejects.toThrow("service failed");
    expect(await env.db.select().from(notification).where(eq(notification.templateKey, "customer.link_approved"))).toEqual([]);
  });

  it("admin.* go to platform admins: one row per admin, shop's organization, per-recipient dedupe (07 §1.1)", async () => {
    const ctx = staffCtx(env.base, "owner");
    const [admin] = await env.db
      .insert(platformAdmin)
      .values({ email: "ops@example.test", displayName: "Ops", passwordHash: "test-only" })
      .returning();
    const row = await withTx(ctx, (tx) =>
      enqueueNotification(tx, ctx, {
        key: "admin.feedback",
        recipient: { type: "platform_admin", id: admin?.id ?? "" },
        payload: { shopName: "Shop a", message: "hi" },
        dedupeKey: "feedback:f1",
      }),
    );
    expect(row).toMatchObject({
      recipientType: "platform_admin",
      recipientId: admin?.id,
      organizationId: env.base.orgId,
      channel: "email",
      dedupeKey: `feedback:f1:${admin?.id}`,
    });
  });

  it("admin.* to a staff member, or a shop template to a platform admin, is a programming error", async () => {
    const ctx = staffCtx(env.base, "owner");
    await expect(
      withTx(ctx, (tx) =>
        enqueueNotification(tx, ctx, {
          key: "admin.feedback",
          recipient: { type: "staff", id: env.base.staff.owner },
          payload: { shopName: "Shop a", message: "hi" },
          dedupeKey: "feedback:f2",
        }),
      ),
    ).rejects.toThrow(/cannot go to a staff recipient/);
    await expect(
      withTx(ctx, (tx) =>
        enqueueNotification(tx, ctx, {
          key: "customer.link_approved",
          recipient: { type: "platform_admin", id: env.base.staff.owner },
          payload: { shopName: "Shop a" },
          dedupeKey: "link_approved:x",
        }),
      ),
    ).rejects.toThrow(/cannot go to a platform_admin recipient/);
  });
});
