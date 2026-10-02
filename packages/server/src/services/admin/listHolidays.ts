import type { AdminListHolidaysParams, AdminListHolidaysResponse } from "@app/contracts/endpoints/admin.listHolidays";
import { publicHoliday } from "@app/db/schema";
import { and, asc, gte, lte } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
/** Global reference data; access is guarded by withAdmin. */
export async function adminListHolidays(_ctx: RequestContext, input: AdminListHolidaysParams): Promise<AdminListHolidaysResponse> {
  return getDb()
    .select({ date: publicHoliday.holidayDate, nameTh: publicHoliday.nameTh })
    .from(publicHoliday)
    .where(and(gte(publicHoliday.holidayDate, `${input.year}-01-01`), lte(publicHoliday.holidayDate, `${input.year}-12-31`)))
    .orderBy(asc(publicHoliday.holidayDate));
}
