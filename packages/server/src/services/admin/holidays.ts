import type { AdminHolidaysParams, AdminHolidaysRequest, AdminHolidaysResponse } from "@app/contracts/endpoints/admin.holidays";
import { publicHoliday } from "@app/db/schema";
import { and, gte, lte } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";

/** Replaces the Thai public holidays of `year` (global reference data; existing branch closures are copies and stay). */
export async function adminHolidays(
  ctx: RequestContext,
  input: AdminHolidaysParams & AdminHolidaysRequest,
): Promise<AdminHolidaysResponse> {
  const fields: Record<string, string> = {};
  input.days.forEach((d, i) => {
    if (!d.date.startsWith(`${input.year}-`)) fields[`days.${i}.date`] = `date must be in ${input.year}`;
  });
  if (Object.keys(fields).length > 0) throw new AppError("VALIDATION_FAILED", { fields });
  await withTx(ctx, async (tx) => {
    // public_holiday has no organization_id (platform reference data)
    await tx
      .delete(publicHoliday)
      .where(and(gte(publicHoliday.holidayDate, `${input.year}-01-01`), lte(publicHoliday.holidayDate, `${input.year}-12-31`)));
    if (input.days.length > 0) {
      await tx.insert(publicHoliday).values(input.days.map((d) => ({ holidayDate: d.date, nameTh: d.nameTh.trim(), createdAt: ctx.now })));
    }
  });
}
