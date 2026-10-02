import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import type { CustomersListRequest, CustomersListResponse, CustomersSort } from "@app/contracts/endpoints/customers.list";
import { customer, lineIdentity, ownerProfile, pet } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { and, asc, ilike, inArray, like, or, type SQL, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const PHONE_LIKE_RE = /^\+?[\d\s\-()]+$/;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** E.164 prefix for a phone-shaped term (R-22): full numbers normalize exactly, partial ones get the same trunk handling. */
function phonePrefix(q: string): string | null {
  if (!PHONE_LIKE_RE.test(q)) return null;
  const full = normalizePhone({ input: q });
  if (full.e164) return full.e164;
  const s = q.replace(/[\s\-()]/g, "");
  let national: string;
  if (s.startsWith("+66")) national = s.slice(3);
  else if (s.startsWith("66")) national = s.slice(2);
  else if (s.startsWith("0")) national = s;
  else if (s.startsWith("+")) return s.length > 1 ? s : null;
  else return null;
  if (national.startsWith("0")) national = national.slice(1);
  return national ? `+66${national}` : null;
}

/** customers whose owner name/nickname/phone or one of whose pets matches q (same rules as search.quick) */
function matching(db: Executor, q: string): SQL | undefined {
  const pattern = `%${escapeLike(q)}%`;
  const ownerMatch: SQL[] = [
    ilike(ownerProfile.firstName, pattern),
    ilike(ownerProfile.lastName, pattern),
    ilike(ownerProfile.nickname, pattern),
  ];
  const prefix = phonePrefix(q);
  if (prefix) ownerMatch.push(like(ownerProfile.phoneE164, `${escapeLike(prefix)}%`));
  return or(
    inArray(
      customer.ownerProfileId,
      db
        .select({ id: ownerProfile.id })
        .from(ownerProfile)
        .where(or(...ownerMatch)),
    ),
    inArray(customer.ownerProfileId, db.select({ id: pet.ownerProfileId }).from(pet).where(ilike(pet.name, pattern))),
  );
}

// ---- keyset pagination: cursor = base64url(JSON [sortKey, id]) of the last row of the previous page
const ownerName = sql<string>`(select ${ownerProfile.firstName} from ${ownerProfile} where ${ownerProfile.id} = ${customer.ownerProfileId})`;
type Key = string | null;

function decodeCursor(cursor: string): [Key, string] {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(v) && v.length === 2 && (v[0] === null || typeof v[0] === "string") && /^[0-9a-f-]{36}$/i.test(String(v[1])))
      return [v[0], v[1]];
  } catch {}
  throw new AppError("VALIDATION_FAILED", { fields: { cursor: "invalid cursor" } });
}

const ORDER: Record<CustomersSort, SQL[]> = {
  last_visit_desc: [sql`${customer.lastVisitAt} desc nulls last`, sql`${customer.id} desc`],
  name_asc: [sql`${ownerName} asc`, asc(customer.id)],
  created_desc: [sql`${customer.createdAt} desc`, sql`${customer.id} desc`],
};

function after(sort: CustomersSort, [key, id]: [Key, string]): SQL {
  switch (sort) {
    case "last_visit_desc":
      // desc nulls last: non-null keys continue with smaller dates, then every null row; null keys continue by id
      return key === null
        ? sql`(${customer.lastVisitAt} is null and ${customer.id} < ${id})`
        : sql`(${customer.lastVisitAt} < ${key} or (${customer.lastVisitAt} = ${key} and ${customer.id} < ${id}) or ${customer.lastVisitAt} is null)`;
    case "name_asc":
      return sql`(${ownerName} > ${key} or (${ownerName} = ${key} and ${customer.id} > ${id}))`;
    case "created_desc":
      return sql`(${customer.createdAt} < ${key} or (${customer.createdAt} = ${key} and ${customer.id} < ${id}))`;
  }
}

/** CustomerListItem rows for tenant-checked customers (owner, pets, LINE link looked up through them). */
export async function customerListItems(db: Executor, customers: (typeof customer.$inferSelect)[]): Promise<CustomerListItem[]> {
  const ownerIds = [...new Set(customers.map((c) => c.ownerProfileId))];
  if (ownerIds.length === 0) return [];
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
  return customers.map((c) => {
    const o = owners.get(c.ownerProfileId);
    return {
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
  });
}

const keyOf = (sort: CustomersSort, c: typeof customer.$inferSelect, name: string): Key =>
  sort === "last_visit_desc" ? (c.lastVisitAt?.toISOString() ?? null) : sort === "created_desc" ? c.createdAt.toISOString() : name;

export async function customersList(ctx: RequestContext, input: CustomersListRequest): Promise<CustomersListResponse> {
  requireRole(ctx, "customers.list");
  const db = getDb();
  const where: SQL[] = [];
  if (input.q) {
    const m = matching(db, input.q);
    if (m) where.push(m);
  }
  if (input.cursor) where.push(after(input.sort, decodeCursor(input.cursor)));
  const rows = (await tenantDb(ctx, db)
    .select(customer, and(...where))
    .orderBy(...ORDER[input.sort])
    .limit(input.limit + 1)) as (typeof customer.$inferSelect)[];
  const page = rows.slice(0, input.limit);
  const items = await customerListItems(db, page);
  const last = page[page.length - 1];
  const lastItem = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > input.limit && last && lastItem
        ? Buffer.from(JSON.stringify([keyOf(input.sort, last, lastItem.firstName), last.id])).toString("base64url")
        : null,
  };
}
