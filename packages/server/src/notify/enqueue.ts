// Outbox (07 header): insert a queued `notification` in the caller's transaction; the dispatcher sends it after commit.
import { notification } from "@app/db/schema";
import type { RequestContext } from "../context.ts";
import type { Executor } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";
import { type NotificationPayloads, TEMPLATES, type TemplateKey } from "./keys.ts";

export type NotificationRow = typeof notification.$inferSelect;
export type Recipient = { type: "customer" | "staff"; id: string };

/** Local `YYYY-MM` in the branch timezone — quota is counted per local month (02#tbl-notification). */
export function localMonthKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}`;
}

/**
 * One row per recipient. The stored dedupe key is `<07 dedupe key>:<recipientId>` so a group template (front_desk+owner…)
 * gets one row per person while re-enqueueing the same event stays a no-op. Returns null when it already existed.
 */
export async function enqueueNotification<K extends TemplateKey>(
  tx: Executor,
  ctx: RequestContext,
  input: { key: K; recipient: Recipient; payload: NotificationPayloads[K]; dedupeKey: string },
): Promise<NotificationRow | null> {
  const meta = TEMPLATES[input.key];
  // Q-0009: recipient_type has no platform_admin yet
  if (meta.recipients === "platform admin")
    throw new Error(`enqueueNotification: ${input.key} needs a platform_admin recipient type (Q-0009)`);
  const [row] = await tenantDb(ctx, tx)
    .insert(notification, {
      branchId: ctx.branchId,
      // the dispatcher overwrites this with the channel R-19 picks
      channel: meta.channels[0],
      recipientType: input.recipient.type,
      recipientId: input.recipient.id,
      templateKey: input.key,
      payload: input.payload,
      dedupeKey: `${input.dedupeKey}:${input.recipient.id}`,
      monthKey: localMonthKey(ctx.now, ctx.timezone),
      status: "queued",
    })
    .onConflictDoNothing({ target: notification.dedupeKey });
  return (row as NotificationRow | undefined) ?? null;
}
