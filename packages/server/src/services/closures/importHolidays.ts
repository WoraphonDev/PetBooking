import type { ClosuresImportHolidaysRequest, ClosuresImportHolidaysResponse } from "@app/contracts/endpoints/closures.importHolidays";
import { branch, branchClosure, publicHoliday } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function closuresImportHolidays(
  ctx: RequestContext,
  input: ClosuresImportHolidaysRequest,
): Promise<ClosuresImportHolidaysResponse> {
  requireRole(ctx, "closures.importHolidays");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  await withTx(ctx, async (tx) => {
    const [scopedBranch] = (await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");
    if (input.dates.length === 0) return;
    // Global reference data; branch_closure is a child of the tenant-checked branch above.
    const holidays = await tx
      .select()
      .from(publicHoliday)
      .where(and(inArray(publicHoliday.holidayDate, input.dates), sql`extract(year from ${publicHoliday.holidayDate}) = ${input.year}`));
    if (holidays.length === 0) return;
    await tx.insert(branchClosure).values(
      holidays.map((holiday) => {
        const bounds = localDayBounds({ date: holiday.holidayDate, timezone: scopedBranch.timezone });
        return {
          branchId: scopedBranch.id,
          startsAt: new Date(bounds.start),
          endsAt: new Date(bounds.end),
          scope: input.scope,
          source: "public_holiday" as const,
          createdBy: ctx.actor.id,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        };
      }),
    );
  });
}
