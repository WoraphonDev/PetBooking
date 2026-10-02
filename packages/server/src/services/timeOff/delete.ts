import type { TimeOffDeleteRequest, TimeOffDeleteResponse } from "@app/contracts/endpoints/timeOff.delete";
import { staffTimeOff } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";

export async function timeOffDelete(ctx: RequestContext, input: TimeOffDeleteRequest): Promise<TimeOffDeleteResponse> {
  requireRole(ctx, "timeOff.delete");
  if (!ctx.orgId) throw new AppError("NOT_FOUND");
  const orgId = ctx.orgId;
  await withTx(ctx, async (tx) => {
    // tenantDb has no delete; the organization filter is applied explicitly
    const deleted = await tx
      .delete(staffTimeOff)
      .where(and(eq(staffTimeOff.organizationId, orgId), eq(staffTimeOff.id, input.timeOffId)))
      .returning({ id: staffTimeOff.id });
    if (deleted.length === 0) throw new AppError("NOT_FOUND");
  });
}
