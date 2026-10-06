import type { LiffDataRequestRequest, LiffDataRequestResponse } from "@app/contracts/endpoints/liff.dataRequest";
import { customer, dataRequest, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Copied from docs/spec/enum-labels.th.json data_request_type (the server has no i18n bundle). */
const TYPE_LABEL = { access: "ขอสำเนาข้อมูล", delete: "ขอลบข้อมูล" } as const;

/**
 * 05#ep-liff.dataRequest (one transaction): an open data_request for the customer's owner_profile in this org and
 * admin.data_request {type = Thai label} to every active platform admin (07 §1.1, dedupe data_request:{requestId}).
 */
export async function liffDataRequest(ctx: RequestContext, input: LiffDataRequestRequest): Promise<LiffDataRequestResponse> {
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const customerId = ctx.actor.id;
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [cust] = (await db.select(customer, eq(customer.id, customerId))) as (typeof customer.$inferSelect)[];
    if (!cust) throw new AppError("NOT_FOUND");
    const [row] = (await db.insert(dataRequest, {
      ownerProfileId: cust.ownerProfileId,
      type: input.type,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof dataRequest.$inferSelect)[];
    if (!row) throw new Error("liff.dataRequest: no inserted row");
    // platform_admin is a platform table (no tenant key)
    const admins = await tx.select({ id: platformAdmin.id }).from(platformAdmin).where(eq(platformAdmin.status, "active"));
    for (const admin of admins)
      await enqueueNotification(tx, ctx, {
        key: "admin.data_request",
        recipient: { type: "platform_admin", id: admin.id },
        payload: { type: TYPE_LABEL[input.type] },
        dedupeKey: `data_request:${row.id}`,
      });
  });
  return undefined;
}
