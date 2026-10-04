import { validService } from "@app/contracts/endpoints/services.create";
import type { ServicesUpdateRequest, ServicesUpdateResponse } from "@app/contracts/endpoints/services.update";
import { service } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { requireServiceBranch, serviceItem } from "./list.ts";
export async function servicesUpdate(
  ctx: RequestContext,
  input: ServicesUpdateRequest & { serviceId: string },
): Promise<ServicesUpdateResponse> {
  requireRole(ctx, "services.update");
  return withTx(ctx, async (tx) => {
    const branchId = await requireServiceBranch(ctx, tx);
    const db = tenantDb(ctx, tx);
    const [before] = (await db.select(
      service,
      and(eq(service.id, input.serviceId), eq(service.branchId, branchId)),
    )) as (typeof service.$inferSelect)[];
    if (!before) throw new AppError("NOT_FOUND");
    const { serviceId, ...fields } = input;
    if (!validService({ ...before, ...fields })) throw new AppError("VALIDATION_FAILED");
    if (fields.photoFileId) await commitFile(tx, ctx, fields.photoFileId, "service_photo");
    const [row] = (await db.update(
      service,
      { ...fields, updatedAt: ctx.now },
      eq(service.id, serviceId),
    )) as (typeof service.$inferSelect)[];
    if (!row) throw new AppError("NOT_FOUND");
    return serviceItem(ctx, tx, row);
  });
}
