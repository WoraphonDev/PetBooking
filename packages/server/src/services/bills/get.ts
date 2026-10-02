import type { BillsGetRequest, BillsGetResponse } from "@app/contracts/endpoints/bills.get";
import { bill } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { billDetail } from "./open.ts";

/** Full bill (05#dto-BillDetail). */
export async function billsGet(ctx: RequestContext, input: BillsGetRequest): Promise<BillsGetResponse> {
  requireRole(ctx, "bills.get");
  const db = getDb();
  const [b] = (await tenantDb(ctx, db).select(bill, eq(bill.id, input.billId))) as (typeof bill.$inferSelect)[];
  if (!b) throw new AppError("NOT_FOUND");
  return billDetail(ctx, db, b);
}
