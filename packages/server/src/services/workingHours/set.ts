import type { WorkingHoursSetRequest, WorkingHoursSetResponse } from "@app/contracts/endpoints/workingHours.set";
import { groomAppointment, staffUser, staffWorkingHours } from "@app/db/schema";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRow } from "../branch/get.ts";
import { staffUserItems } from "../staffUsers/list.ts";

type Day = WorkingHoursSetRequest["days"][number];
const OPEN = ["scheduled", "checked_in", "in_progress"] as const;

/** an appointment is outside when its local weekday is a day off, it starts before / ends after the hours, or it overlaps the break */
function outside(a: { startsAt: Date; endsAt: Date }, days: Map<number, Day>, timezone: string): boolean {
  const date = toLocalDate({ instant: a.startsAt.toISOString(), timezone });
  const day = days.get(new Date(`${date}T00:00:00Z`).getUTCDay());
  if (!day) return true;
  const at = (time: string) => Date.parse(localToUtc({ date, time, timezone }));
  const [start, end] = [a.startsAt.getTime(), a.endsAt.getTime()];
  if (start < at(day.startsAt) || end > at(day.endsAt)) return true;
  return !!(day.breakStartsAt && day.breakEndsAt && start < at(day.breakEndsAt) && end > at(day.breakStartsAt));
}

/**
 * 05#ep-workingHours.set: replaces the staff member's whole week at the session branch (no row = day off).
 * Future appointments now outside the hours stay as they are — warning WORKING_HOURS_AFFECTED (Q-1011).
 */
export async function workingHoursSet(
  ctx: RequestContext,
  input: WorkingHoursSetRequest & { staffUserId: string },
): Promise<WorkingHoursSetResponse> {
  requireRole(ctx, "workingHours.set");
  return withTx(ctx, async (tx) => {
    const br = await branchRow(ctx, tx);
    const repo = tenantDb(ctx, tx);
    const [person] = (await repo.select(staffUser, eq(staffUser.id, input.staffUserId))) as (typeof staffUser.$inferSelect)[];
    if (!person) throw new AppError("NOT_FOUND");

    // tenantDb has no delete: the org key is part of the condition (replace the whole set)
    await tx
      .delete(staffWorkingHours)
      .where(
        and(
          eq(staffWorkingHours.organizationId, br.organizationId),
          eq(staffWorkingHours.staffUserId, person.id),
          eq(staffWorkingHours.branchId, br.id),
        ),
      );
    if (input.days.length)
      await repo.insert(
        staffWorkingHours,
        input.days.map((d) => ({
          branchId: br.id,
          staffUserId: person.id,
          weekday: d.weekday,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          breakStartsAt: d.breakStartsAt ?? null,
          breakEndsAt: d.breakEndsAt ?? null,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })),
      );

    const days = new Map(input.days.map((d) => [d.weekday, d]));
    const future = (await repo
      .select(
        groomAppointment,
        and(
          eq(groomAppointment.branchId, br.id),
          eq(groomAppointment.groomerId, person.id),
          inArray(groomAppointment.status, [...OPEN]),
          gt(groomAppointment.endsAt, ctx.now),
        ),
      )
      .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
    const hit = future.filter((a) => outside(a, days, br.timezone));

    const [item] = await staffUserItems(ctx, tx, [person]);
    if (!item) throw new AppError("NOT_FOUND");
    return hit.length
      ? {
          ...item,
          warnings: [
            {
              code: "WORKING_HOURS_AFFECTED",
              message: `มีนัดของช่างอยู่นอกเวลาทำงานใหม่ ${hit.length} นัด`,
              data: { appointmentIds: hit.map((a) => a.id) },
            },
          ],
        }
      : item;
  });
}
