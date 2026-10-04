import type { ReportCardsSubmitRequest, ReportCardsSubmitResponse } from "@app/contracts/endpoints/reportCards.submit";
import { branch, branchPolicy, notification, pet, reportCard, staffUser } from "@app/db/schema";
import { and, eq, like } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { findReportCard, reportCardDetail } from "./get.ts";

type CardRow = typeof reportCard.$inferSelect;

/**
 * → sent (sent_at) and customer.report_card {petName, L-11 link} (dedupe report_card:{id}). A grooming card whose
 * appointment has not had customer.ready_for_pickup yet rides in that message instead (07 §1; groom.notifyPickup adds the
 * link of a sent card). The after photos / Flex layout belong to the LINE card (T-0149) — the text message carries the link.
 */
export async function sendReportCard(tx: Tx, ctx: RequestContext, c: CardRow): Promise<CardRow> {
  const db = tenantDb(ctx, tx);
  const updated = (await transition(tx, ctx, {
    table: reportCard,
    id: c.id,
    machine: "report_card",
    to: "sent",
    extraSet: { sentAt: ctx.now },
  })) as CardRow;
  if (c.kind === "grooming" && c.appointmentId) {
    const pickup = await db.select(notification, like(notification.dedupeKey, `ready_for_pickup:${c.appointmentId}:%`));
    if (pickup.length === 0) return updated;
  }
  const [br] = (await db.select(branch, eq(branch.id, c.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");
  // pet has no organization_id: reached through the org-checked report card
  const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, c.petId));
  await enqueueNotification(
    tx,
    { ...ctx, branchId: br.id, timezone: br.timezone },
    {
      key: "customer.report_card",
      recipient: { type: "customer", id: c.customerId },
      payload: {
        petName: p?.name ?? "",
        reportCardUrl: new URL(`/liff/${br.bookingSlug}/report-cards/${c.id}`, process.env.APP_BASE_URL).toString(),
      },
      dedupeKey: `report_card:${c.id}`,
    },
  );
  return updated;
}

/**
 * 05#ep-reportCards.submit: a draft (role staff: their own) → pending_review when branch_policy.report_card_requires_review
 * (staff.report_card_review to every front_desk) else sent. A grooming card needs `skin` first (05 reportCards.update).
 */
export async function reportCardsSubmit(ctx: RequestContext, input: ReportCardsSubmitRequest): Promise<ReportCardsSubmitResponse> {
  requireRole(ctx, "reportCards.submit");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const c = await findReportCard(ctx, tx, input.reportCardId);
    if (c.status !== "draft") throw new AppError("INVALID_TRANSITION");
    if (c.kind === "grooming" && !c.skin) throw new AppError("VALIDATION_FAILED", { fields: { skin: "required before submit" } });
    // branch_policy is keyed by the org-checked branch; a missing row means the column default (no review)
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, c.branchId));
    if (!policy?.reportCardRequiresReview) return sendReportCard(tx, ctx, c);

    const updated = (await transition(tx, ctx, { table: reportCard, id: c.id, machine: "report_card", to: "pending_review" })) as CardRow;
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, c.petId));
    const frontDesk = (await db.select(
      staffUser,
      and(eq(staffUser.role, "front_desk"), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of frontDesk)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: c.branchId },
        {
          key: "staff.report_card_review",
          recipient: { type: "staff", id: member.id },
          payload: { petName: p?.name ?? "" },
          dedupeKey: `rc_review:${c.id}`,
        },
      );
    return updated;
  });
  return reportCardDetail(ctx, getDb(), row);
}
