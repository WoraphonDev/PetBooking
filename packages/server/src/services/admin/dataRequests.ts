import type { AdminDataRequestsRequest, AdminDataRequestsResponse } from "@app/contracts/endpoints/admin.dataRequests";
import { dataRequest, organization } from "@app/db/schema";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** PDPA requests of every shop, newest first. */
export async function adminDataRequests(ctx: RequestContext, _input: AdminDataRequestsRequest): Promise<AdminDataRequestsResponse> {
  const db = getDb();
  // Organization is the global tenant registry; data_request rows are read per organization through tenantDb.
  const orgs = await db.select().from(organization);
  const items = await Promise.all(
    orgs.map(async (org) => {
      const rows = (await tenantDb({ ...ctx, orgId: org.id }, db).select(dataRequest)) as (typeof dataRequest.$inferSelect)[];
      return rows.map((r) => ({
        id: r.id,
        orgName: org.name,
        ownerProfileId: r.ownerProfileId,
        type: r.type,
        status: r.status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
  );
  return items.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
