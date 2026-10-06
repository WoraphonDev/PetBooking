// Dispatcher (07 header, §3): after commit / from cron.tick, send queued notifications.
// Channel = R-19 limited to the template's channels; customer LINE push goes through R-18 quota + economy mode.
import {
  branch,
  branchPolicy,
  customer,
  lineChannel,
  lineIdentity,
  notification,
  platformAdmin,
  staffUser,
  webPushSubscription,
} from "@app/db/schema";
import { selectChannel } from "@app/domain/notify/channel";
import { decideLinePush } from "@app/domain/notify/line-quota";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, isNull } from "drizzle-orm";
import { makeSystemCtx, type RequestContext } from "../context.ts";
import { getDb, type Tx } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";
import { enqueueNotification, type NotificationRow } from "./enqueue.ts";
import { type NotificationPayloads, TEMPLATES, type TemplateKey } from "./keys.ts";
import type { NotifyDeps } from "./senders.ts";
import { type Rendered, renderTemplate } from "./templates/index.ts";

type Channel = NotificationRow["channel"];
type SkipReason = NonNullable<NotificationRow["skipReason"]>;
type Outcome =
  | { status: "sent"; channel: Channel }
  | { status: "skipped"; channel: Channel; skipReason: SkipReason }
  | { status: "failed"; channel: Channel; error: string };

/** R-18 step 7: owners are warned once per month when sent pushes reach this share of the quota */
const QUOTA_WARNING_PERCENT = 80;

/**
 * Sends up to `limit` queued rows (oldest first) and returns how many were processed.
 * Each row is claimed with FOR UPDATE SKIP LOCKED in its own transaction, so concurrent ticks never send twice.
 */
export async function dispatchQueued(deps: NotifyDeps, opts: { now: Date; limit?: number }): Promise<number> {
  const limit = opts.limit ?? 100;
  let processed = 0;
  while (processed < limit) {
    const done = await getDb().transaction(async (tx) => {
      // cross-org claim (system job): the only query not scoped by tenantDb — everything after it is
      const [row] = await tx
        .select()
        .from(notification)
        .where(eq(notification.status, "queued"))
        .orderBy(asc(notification.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return false;
      const ctx = makeSystemCtx(row.organizationId, opts.now);
      const outcome = await deliver(deps, tx, ctx, row);
      await tenantDb(ctx, tx).update(
        notification,
        {
          status: outcome.status,
          channel: outcome.channel,
          skipReason: outcome.status === "skipped" ? outcome.skipReason : null,
          error: outcome.status === "failed" ? outcome.error : null,
          sentAt: outcome.status === "sent" ? opts.now : null,
        },
        eq(notification.id, row.id),
      );
      return true;
    });
    if (!done) break;
    processed++;
  }
  return processed;
}

async function deliver(deps: NotifyDeps, tx: Tx, ctx: RequestContext, row: NotificationRow): Promise<Outcome> {
  const key = row.templateKey as TemplateKey;
  const meta = TEMPLATES[key];
  if (!meta) return { status: "failed", channel: row.channel, error: `unknown template ${row.templateKey}` };
  const rendered = renderTemplate(key, row.payload as NotificationPayloads[TemplateKey]);
  const { text } = rendered;
  const skip = (skipReason: SkipReason): Outcome => ({ status: "skipped", channel: row.channel, skipReason });
  // the channel being tried when an adapter throws
  const attempt: { channel: Channel } = { channel: row.channel };
  try {
    if (row.recipientType === "customer") return await deliverToCustomer(deps, tx, ctx, row, key, text, skip, attempt);
    if (row.recipientType === "platform_admin") return await deliverToPlatformAdmin(deps, tx, row, rendered, skip);
    return await deliverToStaff(deps, tx, ctx, row, key, rendered, skip, attempt);
  } catch (e) {
    // adapter errors only carry API status/messages — never tokens (01 §10)
    return { status: "failed", channel: attempt.channel, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}

async function deliverToCustomer(
  deps: NotifyDeps,
  tx: Tx,
  ctx: RequestContext,
  row: NotificationRow,
  key: TemplateKey,
  text: string,
  skip: (r: SkipReason) => Outcome,
  attempt: { channel: Channel },
): Promise<Outcome> {
  const meta = TEMPLATES[key];
  const db = tenantDb(ctx, tx);
  if (!row.branchId) return skip("no_recipient");
  const [channel] = (await db.select(lineChannel, eq(lineChannel.branchId, row.branchId))) as (typeof lineChannel.$inferSelect)[];
  const [cust] = (await db.select(customer, eq(customer.id, row.recipientId))) as (typeof customer.$inferSelect)[];
  // OA not connected → the shop can't reach anyone over LINE (row shows up in "ข้อความที่ไม่ได้ส่ง")
  if (channel?.status !== "active" || !cust) return skip("no_recipient");
  // line_identity has no organization_id: reached through the org-checked customer + this branch's provider
  const [identity] = await tx
    .select()
    .from(lineIdentity)
    .where(and(eq(lineIdentity.ownerProfileId, cust.ownerProfileId), eq(lineIdentity.providerId, channel.providerId)));

  const picked = selectChannel({
    recipientType: "customer",
    hasLineIdentity: !!identity,
    isFriend: identity?.isFriend ?? false,
    templateAllowsReply: (meta.channels as readonly Channel[]).includes("line_reply"),
    replyTokenAgeSeconds: identity
      ? (deps.replyTokens?.ageSeconds({ messagingChannelId: channel.messagingChannelId, lineUserId: identity.lineUserId, now: ctx.now }) ??
        null)
      : null,
    activePushSubscriptions: 0,
    isOwner: false,
    hasEmail: false,
  });
  if (!picked.channel || !identity || !(meta.channels as readonly Channel[]).includes(picked.channel)) return skip("no_recipient");

  // a reply token is single-use: one that is gone by now falls back to push (+ R-18), recorded as line_push
  let replyToken: string | undefined;
  if (picked.channel === "line_reply") {
    replyToken =
      deps.replyTokens?.take({ messagingChannelId: channel.messagingChannelId, lineUserId: identity.lineUserId, now: ctx.now }) ??
      undefined;
    if (!replyToken) {
      if (!(meta.channels as readonly Channel[]).includes("line_push")) return skip("no_recipient");
      picked.channel = "line_push";
    }
  }

  // R-18 applies to push only — replies are free
  let used = 0;
  if (picked.channel === "line_push") {
    const sentThisMonth = await db.select(
      notification,
      and(
        eq(notification.branchId, row.branchId),
        eq(notification.monthKey, row.monthKey),
        eq(notification.channel, "line_push"),
        eq(notification.status, "sent"),
      ),
    );
    used = sentThisMonth.length;
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, row.branchId));
    const decision = decideLinePush({
      monthlyQuota: channel.monthlyPushQuota,
      usedThisMonth: used,
      messageClass: meta.messageClass ?? "helpful",
      economyMode: policy?.economyMode ?? false,
      economyBehavior: meta.economy ?? "send",
    });
    if (!decision.send) return { status: "skipped", channel: picked.channel, skipReason: decision.skipReason ?? "quota_exhausted" };
  }

  attempt.channel = picked.channel;
  try {
    await deps.line.send({ lineChannel: channel, lineUserId: identity.lineUserId, text, ...(replyToken ? { replyToken } : {}) });
  } catch (e) {
    if (e instanceof Error && LINE_UNAUTHORIZED.test(e.message)) await markLineChannelError(tx, ctx, channel);
    throw e;
  }
  if (picked.channel === "line_push") await warnOwnersAtQuota(tx, ctx, row, used + 1, channel.monthlyPushQuota);
  return { status: "sent", channel: picked.channel };
}

/** 07 §1.1: admin.* are email-only and always emailed (no R-19 / R-18); a disabled or missing admin → no_recipient */
async function deliverToPlatformAdmin(
  deps: NotifyDeps,
  tx: Tx,
  row: NotificationRow,
  rendered: Rendered,
  skip: (r: SkipReason) => Outcome,
): Promise<Outcome> {
  // platform_admin has no organization_id (platform table)
  const [admin] = await tx.select().from(platformAdmin).where(eq(platformAdmin.id, row.recipientId));
  if (admin?.status !== "active" || !admin.email) return skip("no_recipient");
  await deps.email.send({ to: admin.email, subject: rendered.subject, text: rendered.text });
  return { status: "sent", channel: "email" };
}

async function deliverToStaff(
  deps: NotifyDeps,
  tx: Tx,
  ctx: RequestContext,
  row: NotificationRow,
  key: TemplateKey,
  rendered: Rendered,
  skip: (r: SkipReason) => Outcome,
  attempt: { channel: Channel },
): Promise<Outcome> {
  const { text, subject, url } = rendered;
  const meta = TEMPLATES[key];
  const allowed = meta.channels as readonly Channel[];
  const db = tenantDb(ctx, tx);
  const [staff] = (await db.select(staffUser, eq(staffUser.id, row.recipientId))) as (typeof staffUser.$inferSelect)[];
  if (!staff || staff.status === "disabled") return skip("no_recipient");

  let channel: Channel | null;
  const subs = (await db.select(
    webPushSubscription,
    and(eq(webPushSubscription.staffUserId, staff.id), isNull(webPushSubscription.disabledAt)),
  )) as (typeof webPushSubscription.$inferSelect)[];
  if (allowed.length === 1 && allowed[0] === "email") {
    // invite / password reset go to the person's mailbox, never to a device
    channel = staff.email ? "email" : null;
  } else {
    channel = selectChannel({
      recipientType: "staff",
      hasLineIdentity: false,
      isFriend: false,
      templateAllowsReply: false,
      replyTokenAgeSeconds: null,
      activePushSubscriptions: subs.length,
      isOwner: staff.role === "owner",
      hasEmail: !!staff.email,
    }).channel;
  }
  if (!channel || !allowed.includes(channel)) return skip("no_recipient");
  attempt.channel = channel;

  if (channel === "email") {
    await deps.email.send({ to: staff.email as string, subject, text });
    return { status: "sent", channel };
  }
  // web_push → every active device; 404/410 disables that subscription
  let delivered = 0;
  for (const s of subs) {
    const r = await deps.webPush.send({ subscription: { id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, text, url });
    if ("gone" in r) await db.update(webPushSubscription, { disabledAt: ctx.now }, eq(webPushSubscription.id, s.id));
    else {
      delivered++;
      await db.update(webPushSubscription, { lastSuccessAt: ctx.now }, eq(webPushSubscription.id, s.id));
    }
  }
  return delivered > 0
    ? { status: "sent", channel }
    : { status: "failed", channel, error: "no web push subscription accepted the message" };
}

/** R-18 step 7: once sent pushes reach 80% → owner.quota_warning to every active owner, deduped per branch + month. */
/** createLineSender's error for a 401 answer ("LINE delivery failed (401)") */
const LINE_UNAUTHORIZED = /\(401\)$/;

/** 01 §7: LINE answered 401 → line_channel.status = error + owners get owner.line_error (Q-1029), once per channel per local day */
async function markLineChannelError(tx: Tx, ctx: RequestContext, channel: typeof lineChannel.$inferSelect): Promise<void> {
  const db = tenantDb(ctx, tx);
  await db.update(lineChannel, { status: "error" }, eq(lineChannel.id, channel.id));
  const [br] = (await db.select(branch, eq(branch.id, channel.branchId))) as (typeof branch.$inferSelect)[];
  const timezone = br?.timezone ?? ctx.timezone;
  const owners = (await db.select(
    staffUser,
    and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
  )) as (typeof staffUser.$inferSelect)[];
  const branchCtx: RequestContext = { ...ctx, branchId: channel.branchId, timezone };
  const localDate = toLocalDate({ instant: ctx.now.toISOString(), timezone });
  for (const owner of owners) {
    await enqueueNotification(tx, branchCtx, {
      key: "owner.line_error",
      recipient: { type: "staff", id: owner.id },
      payload: { branchName: br?.name ?? "" },
      dedupeKey: `line_error:${channel.id}:${localDate}`,
    });
  }
}

async function warnOwnersAtQuota(tx: Tx, ctx: RequestContext, row: NotificationRow, used: number, quota: number): Promise<void> {
  if (!row.branchId || used * 100 < quota * QUOTA_WARNING_PERCENT) return;
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, row.branchId))) as (typeof branch.$inferSelect)[];
  const owners = (await db.select(
    staffUser,
    and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
  )) as (typeof staffUser.$inferSelect)[];
  const branchCtx: RequestContext = { ...ctx, branchId: row.branchId, timezone: br?.timezone ?? ctx.timezone };
  for (const owner of owners) {
    await enqueueNotification(tx, branchCtx, {
      key: "owner.quota_warning",
      recipient: { type: "staff", id: owner.id },
      payload: { used, quota },
      dedupeKey: `quota_warning:${row.branchId}:${row.monthKey}`,
    });
  }
}
