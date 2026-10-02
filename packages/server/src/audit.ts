import { isDeepStrictEqual } from "node:util";
import { auditLog } from "@app/db/schema";
import type { RequestContext } from "./context.ts";
import type { Tx } from "./db.ts";
import { AppError } from "./errors.ts";
import { tenantDb } from "./repo/tenant.ts";

export const AUDIT_ACTIONS = [
  "bill.discount",
  "bill.close",
  "bill.void",
  "bill.reopen_forbidden_attempt",
  "payment.create",
  "payment.void",
  "slip.verify",
  "slip.reject",
  "deposit.waive",
  "refund.create",
  "credit.adjust",
  "booking.cancel",
  "booking.no_show",
  "booking.price_override",
  "stay.vaccine_override",
  "customer.blacklist",
  "customer.reliability_override",
  "customer.merge_link_approve",
  "staff.invite",
  "staff.role_change",
  "staff.disable",
  "policy.update",
  "promptpay.update",
  "line_channel.update",
  "commission_rule.update",
  "data.export",
  "pdpa.erase",
  "support.session_start",
  "support.session_end",
  "import.commit",
  "organization.status_change",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
type AuditEntry = Pick<typeof auditLog.$inferInsert, "entityType" | "entityId" | "reason"> & {
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export async function writeAudit(tx: Tx, ctx: RequestContext, entry: AuditEntry): Promise<void> {
  if (/void|cancel|waive|override|adjust|blacklist/.test(entry.action) && (entry.reason?.trim().length ?? 0) < 3)
    throw new AppError("REASON_REQUIRED");
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])].filter(
    (key) => !isDeepStrictEqual(entry.before?.[key], entry.after?.[key]),
  );
  const pick = (value: Record<string, unknown> | undefined) =>
    value ? Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])) : null;
  const values = {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: pick(entry.before),
    after: pick(entry.after),
    actorType: ctx.actor.type === "admin" ? ("platform_admin" as const) : ctx.actor.type,
    actorId: ctx.actor.id,
    reason: entry.reason ?? null,
    ip: ctx.ip,
    supportAccessLogId: ctx.supportAccessLogId,
    createdAt: ctx.now,
  };
  if (ctx.orgId) await tenantDb(ctx, tx).insert(auditLog, values);
  else await tx.insert(auditLog).values({ ...values, organizationId: null });
}
