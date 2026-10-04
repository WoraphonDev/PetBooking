import type { ReportCardsUpdateRequest, ReportCardsUpdateResponse } from "@app/contracts/endpoints/reportCards.update";
import { reportCard } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { findReportCard, reportCardDetail } from "./get.ts";

const EDITABLE = ["draft", "pending_review"];

/** 05#ep-reportCards.update: draft / pending_review only (else STATUS_NOT_ALLOWED); fields left out keep their value. */
export async function reportCardsUpdate(
  ctx: RequestContext,
  input: ReportCardsUpdateRequest & { reportCardId: string },
): Promise<ReportCardsUpdateResponse> {
  requireRole(ctx, "reportCards.update");
  const { reportCardId, ...fields } = input;
  const row = await withTx(ctx, async (tx) => {
    const c = await findReportCard(ctx, tx, reportCardId);
    if (!EDITABLE.includes(c.status)) throw new AppError("STATUS_NOT_ALLOWED", { status: c.status });
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const [updated] = (await tenantDb(ctx, tx).update(
      reportCard,
      { ...set, updatedAt: ctx.now },
      eq(reportCard.id, c.id),
    )) as (typeof reportCard.$inferSelect)[];
    return updated ?? c;
  });
  return reportCardDetail(ctx, getDb(), row);
}
