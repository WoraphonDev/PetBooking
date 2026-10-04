import type { DaycareNoShowRequest, DaycareNoShowResponse } from "@app/contracts/endpoints/daycare.no_show";
import { booking, branch, branchPolicy, daycareSessionType, daycareVisit } from "@app/db/schema";
import { localToUtc } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "../bookings/get.ts";
import { recordNoShow } from "../stays/noShow.ts";

const MINUTE = 60_000;

/**
 * 05#ep-daycare.no_show: reserved → no_show once now ≥ session start on visit_date + no_show_grace_minutes (03; earlier →
 * STATUS_NOT_ALLOWED {allowedFrom}, as Q-0097), reason on booking_event, audit booking.no_show (R-27), R-09, and R-07 /
 * booking closed when every child ended (`recordNoShow`). 07 sends customer.no_show only for grooming and hotel.
 */
export async function daycareNoShow(
  ctx: RequestContext,
  input: DaycareNoShowRequest & { visitId: string },
): Promise<DaycareNoShowResponse> {
  requireRole(ctx, "daycare.no_show");
  const reason = input.reason || null;
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [v] = (await db.select(daycareVisit, eq(daycareVisit.id, input.visitId))) as (typeof daycareVisit.$inferSelect)[];
    if (!v) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, v.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    const [br] = (await db.select(branch, eq(branch.id, v.branchId))) as (typeof branch.$inferSelect)[];
    const [session] = (await db.select(
      daycareSessionType,
      eq(daycareSessionType.id, v.sessionTypeId),
    )) as (typeof daycareSessionType.$inferSelect)[];
    if (!bk || !br || !session) throw new AppError("NOT_FOUND");
    // branch_policy is keyed by the org-checked branch; a missing row means the column default (30)
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
    const start = Date.parse(localToUtc({ date: v.visitDate, time: session.startsAt.slice(0, 5), timezone: br.timezone }));
    const allowedFrom = new Date(start + (policy?.noShowGraceMinutes ?? 30) * MINUTE);
    if (v.status === "reserved" && ctx.now < allowedFrom)
      throw new AppError("STATUS_NOT_ALLOWED", { allowedFrom: allowedFrom.toISOString() });

    await transition(tx, ctx, { table: daycareVisit, id: v.id, machine: "daycare_visit", to: "no_show", reason });
    await writeAudit(tx, ctx, {
      action: "booking.no_show",
      entityType: "daycare_visit",
      entityId: v.id,
      reason,
      before: { status: v.status },
      after: { status: "no_show", bookingId: bk.id },
    });
    await recordNoShow(tx, ctx, bk, reason);
    return bk.id;
  });
  const item = (await bookingDetail(ctx, getDb(), bookingId)).daycare.find((d) => d.id === input.visitId);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}
