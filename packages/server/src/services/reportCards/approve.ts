import type { ReportCardsApproveRequest, ReportCardsApproveResponse } from "@app/contracts/endpoints/reportCards.approve";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { findReportCard, reportCardDetail } from "./get.ts";
import { sendReportCard } from "./submit.ts";

/** 05#ep-reportCards.approve: pending_review → sent with customer.report_card (same sending rules as reportCards.submit). */
export async function reportCardsApprove(ctx: RequestContext, input: ReportCardsApproveRequest): Promise<ReportCardsApproveResponse> {
  requireRole(ctx, "reportCards.approve");
  const row = await withTx(ctx, async (tx) => {
    const c = await findReportCard(ctx, tx, input.reportCardId);
    if (c.status !== "pending_review") throw new AppError("INVALID_TRANSITION");
    return sendReportCard(tx, ctx, c);
  });
  return reportCardDetail(ctx, getDb(), row);
}
