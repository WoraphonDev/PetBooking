import type { ReportCardsListRequest, ReportCardsListResponse } from "@app/contracts/endpoints/reportCards.list";
import { reportCard } from "@app/db/schema";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { ownOnly, reportCardDetail } from "./get.ts";

/** 05#ep-reportCards.list: report cards of the session branch, newest first; role staff sees only the ones they created. */
export async function reportCardsList(ctx: RequestContext, input: ReportCardsListRequest): Promise<ReportCardsListResponse> {
  requireRole(ctx, "reportCards.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const where: SQL[] = [eq(reportCard.branchId, ctx.branchId)];
  if (input.status) where.push(eq(reportCard.status, input.status));
  const own = ownOnly(ctx);
  if (own) where.push(own);
  const rows = (await tenantDb(ctx, db)
    .select(reportCard, and(...where))
    .orderBy(desc(reportCard.createdAt), desc(reportCard.id))) as (typeof reportCard.$inferSelect)[];
  const out = [];
  for (const r of rows) out.push(await reportCardDetail(ctx, db, r));
  return out;
}
