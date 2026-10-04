import type { ServicesCreateRequest, ServicesCreateResponse } from "@app/contracts/endpoints/services.create";
import { service } from "@app/db/schema";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { requireServiceBranch, serviceItem } from "./list.ts";
export async function servicesCreate(ctx: RequestContext, input: ServicesCreateRequest): Promise<ServicesCreateResponse> {
  requireRole(ctx, "services.create");
  return withTx(ctx, async (tx) => {
    const branchId = await requireServiceBranch(ctx, tx);
    if (input.photoFileId) await commitFile(tx, ctx, input.photoFileId, "service_photo");
    const [row] = (await tenantDb(ctx, tx).insert(service, {
      ...input,
      branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof service.$inferSelect)[];
    if (!row) throw new Error("services.create: no inserted service");
    return serviceItem(ctx, tx, row);
  });
}
