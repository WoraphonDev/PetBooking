import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import type { LinkRequestItem } from "@app/contracts/dto/link-request-item";
import type { LinkRequestsListRequest, LinkRequestsListResponse } from "@app/contracts/endpoints/linkRequests.list";
import { customer, customerLinkRequest, lineIdentity, ownerProfile, pet } from "@app/db/schema";
import { asc, desc, inArray, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

async function candidates(db: Executor, rows: (typeof customer.$inferSelect)[]): Promise<Map<string, CustomerListItem>> {
  const ownerIds = [...new Set(rows.map((c) => c.ownerProfileId))];
  if (ownerIds.length === 0) return new Map();
  // owner_profile / pet / line_identity are shared tables; reached through the tenant-checked customers
  const owners = new Map((await db.select().from(ownerProfile).where(inArray(ownerProfile.id, ownerIds))).map((o) => [o.id, o]));
  const pets = await db
    .select({ id: pet.id, name: pet.name, species: pet.species, ownerProfileId: pet.ownerProfileId })
    .from(pet)
    .where(inArray(pet.ownerProfileId, ownerIds))
    .orderBy(asc(pet.createdAt), asc(pet.id));
  const linked = new Set(
    (await db.select({ id: lineIdentity.ownerProfileId }).from(lineIdentity).where(inArray(lineIdentity.ownerProfileId, ownerIds))).map(
      (l) => l.id,
    ),
  );
  return new Map(
    rows.map((c) => {
      const o = owners.get(c.ownerProfileId);
      const item: CustomerListItem = {
        id: c.id,
        firstName: o?.firstName ?? "",
        lastName: o?.lastName ?? null,
        nickname: o?.nickname ?? null,
        phone: o?.phoneE164 ?? null,
        pets: pets.filter((p) => p.ownerProfileId === c.ownerProfileId).map((p) => ({ id: p.id, name: p.name, species: p.species })),
        reliabilityLevel: c.reliabilityOverride ?? c.reliabilityLevel,
        blacklisted: c.blacklisted,
        lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
        visitCount: c.visitCount,
        creditBalanceSatang: c.creditBalanceSatang,
        lineLinked: linked.has(c.ownerProfileId),
      };
      return [c.id, item];
    }),
  );
}

/** LinkRequestItem for tenant-checked request rows (LINE identity and candidate customer looked up through them). */
export async function linkRequestItems(
  ctx: RequestContext,
  db: Executor,
  rows: (typeof customerLinkRequest.$inferSelect)[],
): Promise<LinkRequestItem[]> {
  if (rows.length === 0) return [];
  const customers = (await tenantDb(ctx, db).select(
    customer,
    inArray(customer.id, [...new Set(rows.map((r) => r.candidateCustomerId))]),
  )) as (typeof customer.$inferSelect)[];
  const candidateById = await candidates(db, customers);
  const identities = new Map(
    (
      await db
        .select()
        .from(lineIdentity)
        .where(inArray(lineIdentity.id, [...new Set(rows.map((r) => r.lineIdentityId))]))
    ).map((l) => [l.id, l]),
  );
  return rows.flatMap((r) => {
    const candidate = candidateById.get(r.candidateCustomerId);
    if (!candidate) return [];
    const line = identities.get(r.lineIdentityId);
    return [
      {
        id: r.id,
        lineDisplayName: line?.displayName ?? null,
        linePictureUrl: line?.pictureUrl ?? null,
        phoneEntered: r.phoneEntered,
        candidate,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

/** Every link request of the organization: pending first, then newest. */
export async function linkRequestsList(ctx: RequestContext, _input: LinkRequestsListRequest): Promise<LinkRequestsListResponse> {
  requireRole(ctx, "linkRequests.list");
  const db = getDb();
  const rows = (await tenantDb(ctx, db)
    .select(customerLinkRequest)
    .orderBy(
      sql`case when ${customerLinkRequest.status} = 'pending' then 0 else 1 end`,
      desc(customerLinkRequest.createdAt),
      desc(customerLinkRequest.id),
    )) as (typeof customerLinkRequest.$inferSelect)[];
  return linkRequestItems(ctx, db, rows);
}
