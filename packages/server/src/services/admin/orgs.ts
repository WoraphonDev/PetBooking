import type { OrgListItem } from "@app/contracts/dto/org-list-item";
import type { AdminOrgsRequest, AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import { booking, branch, lineChannel, organization, staffUser } from "@app/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function orgListItem(ctx: RequestContext, tx: Executor, org: typeof organization.$inferSelect): Promise<OrgListItem> {
  const scoped = tenantDb({ ...ctx, orgId: org.id }, tx);
  const [br] = (await scoped.select(branch).limit(1)) as (typeof branch.$inferSelect)[];
  if (!br) throw new Error("Organization summary requires its MVP branch");
  const [owner] = (await scoped
    .select(staffUser, eq(staffUser.role, "owner"))
    .orderBy(asc(staffUser.createdAt), asc(staffUser.id))
    .limit(1)) as (typeof staffUser.$inferSelect)[];
  const [line] = (await scoped.select(lineChannel, eq(lineChannel.branchId, br.id)).limit(1)) as (typeof lineChannel.$inferSelect)[];
  const [lastBooking] = (await scoped.select(booking).orderBy(desc(booking.createdAt)).limit(1)) as (typeof booking.$inferSelect)[];
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    branchName: br.name,
    bookingSlug: br.bookingSlug,
    ownerEmail: owner?.email ?? null,
    lineStatus: line?.status ?? null,
    createdAt: org.createdAt.toISOString(),
    lastActivityAt: lastBooking?.createdAt.toISOString() ?? null,
  };
}

export async function adminOrgs(ctx: RequestContext, _input: AdminOrgsRequest): Promise<AdminOrgsResponse> {
  const db = getDb();
  // Organization is a global tenant registry; its child rows are always read through tenantDb.
  const orgs = await db.select().from(organization);
  return Promise.all(orgs.map((org) => orgListItem(ctx, db, org)));
}
