import type { AdminUpdateOrgRequest, AdminUpdateOrgResponse } from "@app/contracts/endpoints/admin.updateOrg";
import { organization } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { orgListItem } from "./orgs.ts";

export async function adminUpdateOrg(
  ctx: RequestContext,
  input: AdminUpdateOrgRequest & { orgId: string },
): Promise<AdminUpdateOrgResponse> {
  return withTx(ctx, async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, input.orgId)).for("update");
    if (!org) throw new AppError("NOT_FOUND");
    if (org.status !== input.status) {
      await tx.update(organization).set({ status: input.status, updatedAt: ctx.now }).where(eq(organization.id, org.id));
      await writeAudit(
        tx,
        { ...ctx, orgId: org.id },
        {
          action: "organization.status_change",
          entityType: "organization",
          entityId: org.id,
          before: { status: org.status },
          after: { status: input.status },
        },
      );
    }
    return orgListItem(ctx, tx, { ...org, status: input.status });
  });
}
