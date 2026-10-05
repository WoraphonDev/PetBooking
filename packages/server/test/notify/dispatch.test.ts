// T-0010: dispatchQueued — R-19 channel (limited by template), R-18 quota/economy, adapters via fakes, 80% owner warning.
import { randomUUID } from "node:crypto";
import { branchPolicy, lineChannel, lineIdentity, notification, platformAdmin, staffUser, webPushSubscription } from "@app/db/schema";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTx } from "../../src/db.ts";
import { dispatchQueued } from "../../src/notify/dispatch.ts";
import { enqueueNotification } from "../../src/notify/enqueue.ts";
import type { NotificationPayloads, TemplateKey } from "../../src/notify/keys.ts";
import type { NotifyDeps } from "../../src/notify/senders.ts";
import { type SeedOrg, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());

type Calls = { line: { lineUserId: string; text: string }[]; webPush: string[]; email: { to: string; subject?: string; text: string }[] };
function fakes(opts: { failLine?: boolean; goneEndpoints?: string[] } = {}): { deps: NotifyDeps; calls: Calls } {
  const calls: Calls = { line: [], webPush: [], email: [] };
  return {
    calls,
    deps: {
      line: {
        send: async ({ lineUserId, text }) => {
          if (opts.failLine) throw new Error("LINE 500");
          calls.line.push({ lineUserId, text });
        },
      },
      webPush: {
        send: async ({ subscription }) => {
          calls.webPush.push(subscription.endpoint);
          return opts.goneEndpoints?.includes(subscription.endpoint) ? { gone: true } : { ok: true };
        },
      },
      email: {
        send: async (m) => {
          calls.email.push(m);
        },
      },
    },
  };
}

let n = 0;
/** A fresh shop (own quota counters) with a LINE OA and the seeded customer as an OA friend. */
async function shop(
  opts: { quota?: number; economy?: boolean; lineStatus?: "active" | "pending"; identity?: "friend" | "not_friend" | "none" } = {},
) {
  const s = await seedOrg(env.db, `n${++n}`);
  const providerId = `prov-${n}`;
  await env.db.insert(lineChannel).values({
    organizationId: s.orgId,
    branchId: s.branchId,
    providerId,
    messagingChannelId: `msg-${n}`,
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: `login-${n}`,
    liffId: `liff-${n}`,
    monthlyPushQuota: opts.quota ?? 300,
    status: opts.lineStatus ?? "active",
  });
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, economyMode: opts.economy ?? false });
  if ((opts.identity ?? "friend") !== "none") {
    await env.db
      .insert(lineIdentity)
      .values({ providerId, lineUserId: `U${n}`, ownerProfileId: s.ownerProfileId, isFriend: opts.identity !== "not_friend" });
  }
  return s;
}

/** Pretend `used` pushes were already sent this month. */
async function usePushes(s: SeedOrg, used: number) {
  if (used === 0) return;
  await env.db.insert(notification).values(
    Array.from({ length: used }, () => ({
      organizationId: s.orgId,
      branchId: s.branchId,
      channel: "line_push" as const,
      recipientType: "customer" as const,
      recipientId: s.customerId,
      templateKey: "customer.receipt",
      payload: {},
      dedupeKey: `used:${randomUUID()}`,
      monthKey: "2026-10",
      status: "sent" as const,
    })),
  );
}

async function enqueue<K extends TemplateKey>(
  s: SeedOrg,
  key: K,
  recipient: { type: "customer" | "staff" | "platform_admin"; id: string },
  payload: NotificationPayloads[K],
) {
  const ctx = staffCtx(s, "owner");
  const row = await withTx(ctx, (tx) => enqueueNotification(tx, ctx, { key, recipient, payload, dedupeKey: `${key}:${randomUUID()}` }));
  if (!row) throw new Error("enqueue returned null");
  return row.id;
}

const rowOf = async (id: string) => (await env.db.select().from(notification).where(eq(notification.id, id)))[0];
const dispatch = (deps: NotifyDeps) => dispatchQueued(deps, { now: TEST_NOW });

const confirmed = { bookingNo: "B-1", summary: "อาบน้ำ", dateTime: "5 ต.ค. 10:00", shopName: "Shop", mapUrl: "m", bookingUrl: "b" };
const reminder = { petName: "โมจิ", dateTime: "พรุ่งนี้ 10:00", service: "อาบน้ำ", bookingUrl: "b" };
const nextGroom = { petName: "โมจิ", dueDate: "2026-11-01", bookUrl: "u" };
const newBooking = { bookingNo: "B-1", customerName: "คุณเอ", summary: "อาบน้ำ" };

describe("customer (LINE)", () => {
  it("push: sent via line_push to the OA friend with the rendered text", async () => {
    const s = await shop();
    const id = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    const { deps, calls } = fakes();
    await dispatch(deps);
    expect(await rowOf(id)).toMatchObject({ status: "sent", channel: "line_push", skipReason: null, sentAt: TEST_NOW, error: null });
    expect(calls.line).toEqual([{ lineUserId: `U${n}`, text: "ยืนยันการจอง B-1 ✅\nอาบน้ำ\n📅 5 ต.ค. 10:00\nแผนที่: m" }]);
  });

  it.each([
    ["not a friend of the OA", { identity: "not_friend" as const }],
    ["no line_identity", { identity: "none" as const }],
    ["LINE OA not connected", { lineStatus: "pending" as const }],
  ])("%s → skipped no_recipient", async (_name, opts) => {
    const s = await shop(opts);
    const id = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    const { deps, calls } = fakes();
    await dispatch(deps);
    expect(await rowOf(id)).toMatchObject({ status: "skipped", skipReason: "no_recipient", sentAt: null });
    expect(calls.line).toEqual([]);
  });

  it("quota used up → quota_exhausted even for essential", async () => {
    const s = await shop({ quota: 5 });
    await usePushes(s, 5);
    const id = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    await dispatch(fakes().deps);
    expect(await rowOf(id)).toMatchObject({ status: "skipped", channel: "line_push", skipReason: "quota_exhausted" });
  });

  it("at 90%: helpful is held back, essential still goes", async () => {
    const s = await shop({ quota: 10 });
    await usePushes(s, 9);
    const helpful = await enqueue(s, "customer.reminder_24h", { type: "customer", id: s.customerId }, reminder);
    await dispatch(fakes().deps);
    expect(await rowOf(helpful)).toMatchObject({ status: "skipped", skipReason: "quota_exhausted" });
    const essential = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    await dispatch(fakes().deps);
    expect(await rowOf(essential)).toMatchObject({ status: "sent" });
  });

  it("marketing stops at 70%", async () => {
    const s = await shop({ quota: 10 });
    await usePushes(s, 7);
    const id = await enqueue(s, "customer.next_groom_reminder", { type: "customer", id: s.customerId }, nextGroom);
    await dispatch(fakes().deps);
    expect(await rowOf(id)).toMatchObject({ status: "skipped", skipReason: "quota_exhausted" });
  });

  it("economy mode: templates marked skip are skipped, send templates still go", async () => {
    const s = await shop({ economy: true });
    const skipped = await enqueue(s, "customer.reminder_24h", { type: "customer", id: s.customerId }, reminder);
    const sent = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    await dispatch(fakes().deps);
    expect(await rowOf(skipped)).toMatchObject({ status: "skipped", skipReason: "economy_mode" });
    expect(await rowOf(sent)).toMatchObject({ status: "sent" });
  });

  it("adapter error → failed with the error message", async () => {
    const s = await shop();
    const id = await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    await dispatch(fakes({ failLine: true }).deps);
    expect(await rowOf(id)).toMatchObject({ status: "failed", channel: "line_push", error: "LINE 500", sentAt: null });
  });

  it("80% reached → owner.quota_warning once per owner per month", async () => {
    const s = await shop({ quota: 10 });
    const [owner2] = await env.db
      .insert(staffUser)
      .values({ organizationId: s.orgId, email: `owner2-${n}@x.test`, displayName: "owner2", role: "owner", status: "active" })
      .returning();
    await usePushes(s, 7);
    await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed); // → 8/10 = 80%
    await dispatch(fakes().deps);
    await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed); // → 9/10, already warned
    await dispatch(fakes().deps);
    const warnings = await env.db
      .select()
      .from(notification)
      .where(and(eq(notification.organizationId, s.orgId), eq(notification.templateKey, "owner.quota_warning")));
    expect(warnings.map((w) => w.recipientId).sort()).toEqual([s.staff.owner, owner2?.id].sort());
    expect(warnings[0]?.payload).toEqual({ used: 8, quota: 10 });
    expect(warnings.every((w) => w.dedupeKey.startsWith(`quota_warning:${s.branchId}:2026-10:`))).toBe(true);
  });
});

describe("staff (Web Push / email)", () => {
  const addDevice = (s: SeedOrg, staffId: string, endpoint: string) =>
    env.db.insert(webPushSubscription).values({ organizationId: s.orgId, staffUserId: staffId, endpoint, p256dh: "k", auth: "a" });

  it("web_push to every active device; 404/410 disables that subscription", async () => {
    const s = await shop();
    await addDevice(s, s.staff.front_desk, `https://push/${n}/a`);
    await addDevice(s, s.staff.front_desk, `https://push/${n}/gone`);
    const id = await enqueue(s, "staff.new_booking", { type: "staff", id: s.staff.front_desk }, newBooking);
    const { deps, calls } = fakes({ goneEndpoints: [`https://push/${n}/gone`] });
    await dispatch(deps);
    expect(await rowOf(id)).toMatchObject({ status: "sent", channel: "web_push" });
    expect(calls.webPush.sort()).toEqual([`https://push/${n}/a`, `https://push/${n}/gone`]);
    const subs = await env.db
      .select()
      .from(webPushSubscription)
      .where(like(webPushSubscription.endpoint, `https://push/${n}/%`));
    expect(subs.find((x) => x.endpoint.endsWith("/gone"))?.disabledAt).toEqual(TEST_NOW);
    expect(subs.find((x) => x.endpoint.endsWith("/a"))).toMatchObject({ disabledAt: null, lastSuccessAt: TEST_NOW });
  });

  it("owner without a device: web_push-only template → no_recipient; web_push|email template → email", async () => {
    const s = await shop();
    const pushOnly = await enqueue(s, "staff.new_booking", { type: "staff", id: s.staff.owner }, newBooking);
    const withEmail = await enqueue(s, "owner.support_access", { type: "staff", id: s.staff.owner }, { reason: "ตรวจบั๊ก" });
    const { deps, calls } = fakes();
    await dispatch(deps);
    expect(await rowOf(pushOnly)).toMatchObject({ status: "skipped", skipReason: "no_recipient" });
    expect(await rowOf(withEmail)).toMatchObject({ status: "sent", channel: "email" });
    expect(calls.email).toContainEqual({
      to: `owner@n${n}.test`,
      subject: "ทีมงานเข้าดูข้อมูลร้านของคุณ",
      text: "ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: ตรวจบั๊ก",
    });
  });

  it("email-only templates go to the mailbox even with devices; no email → no_recipient", async () => {
    const s = await shop();
    await addDevice(s, s.staff.staff, `https://push/${n}/dev`);
    const reset = await enqueue(s, "staff.password_reset", { type: "staff", id: s.staff.staff }, { resetUrl: "r" });
    await env.db.update(staffUser).set({ email: null }).where(eq(staffUser.id, s.staff.front_desk));
    const noEmail = await enqueue(s, "staff.password_reset", { type: "staff", id: s.staff.front_desk }, { resetUrl: "r" });
    const { deps, calls } = fakes();
    await dispatch(deps);
    expect(await rowOf(reset)).toMatchObject({ status: "sent", channel: "email" });
    expect(await rowOf(noEmail)).toMatchObject({ status: "skipped", skipReason: "no_recipient" });
    expect(calls.webPush).toEqual([]);
  });

  it("staff without devices (not owner) / disabled staff → no_recipient", async () => {
    const s = await shop();
    const noDevice = await enqueue(s, "staff.groom_done", { type: "staff", id: s.staff.staff }, { petName: "โมจิ", groomerName: "พี่บี" });
    await addDevice(s, s.staff.front_desk, `https://push/${n}/fd`);
    await env.db.update(staffUser).set({ status: "disabled" }).where(eq(staffUser.id, s.staff.front_desk));
    const disabled = await enqueue(s, "staff.groom_done", { type: "staff", id: s.staff.front_desk }, { petName: "โมจิ", groomerName: "พี่บี" });
    await dispatch(fakes().deps);
    expect(await rowOf(noDevice)).toMatchObject({ status: "skipped", skipReason: "no_recipient" });
    expect(await rowOf(disabled)).toMatchObject({ status: "skipped", skipReason: "no_recipient" });
  });
});

describe("platform admin (email only, 07 §1.1)", () => {
  it("emails an active admin with the rendered subject/text; a disabled admin → no_recipient; no R-18 quota use", async () => {
    const s = await shop({ quota: 0 });
    const admins = await env.db
      .insert(platformAdmin)
      .values([
        { email: `ops${n}@example.test`, displayName: "Ops", passwordHash: "test-only" },
        { email: `old${n}@example.test`, displayName: "Old", passwordHash: "test-only", status: "disabled" },
      ])
      .returning();
    const payload = { shopName: "ร้านน้องหมา", message: "ปุ่มบันทึกกดไม่ได้" };
    const active = await enqueue(s, "admin.feedback", { type: "platform_admin", id: admins[0]?.id ?? "" }, payload);
    const disabled = await enqueue(s, "admin.feedback", { type: "platform_admin", id: admins[1]?.id ?? "" }, payload);
    const { deps, calls } = fakes();
    await dispatch(deps);
    expect(await rowOf(active)).toMatchObject({ status: "sent", channel: "email", sentAt: TEST_NOW });
    expect(await rowOf(disabled)).toMatchObject({ status: "skipped", skipReason: "no_recipient" });
    expect(calls.email).toEqual([
      { to: `ops${n}@example.test`, subject: "[Feedback] ร้านน้องหมา", text: "[Feedback] ร้านน้องหมา: ปุ่มบันทึกกดไม่ได้" },
    ]);
    expect(calls.line).toEqual([]);
  });
});

describe("dispatchQueued", () => {
  it("is idempotent: nothing queued → 0 processed, nothing re-sent", async () => {
    const s = await shop();
    await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    expect(await dispatch(fakes().deps)).toBeGreaterThan(0);
    const again = fakes();
    expect(await dispatch(again.deps)).toBe(0);
    expect(again.calls).toEqual({ line: [], webPush: [], email: [] });
  });

  it("respects the limit", async () => {
    const s = await shop();
    await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    await enqueue(s, "customer.booking_confirmed", { type: "customer", id: s.customerId }, confirmed);
    expect(await dispatchQueued(fakes().deps, { now: TEST_NOW, limit: 1 })).toBe(1);
    expect(await dispatch(fakes().deps)).toBe(1);
  });
});
