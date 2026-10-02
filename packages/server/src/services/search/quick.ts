import type { BookingListItem } from "@app/contracts/dto/booking-list-item";
import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import type { SearchQuickRequest, SearchQuickResponse } from "@app/contracts/endpoints/search.quick";
import type { ServiceScope } from "@app/contracts/enums";
import { booking, customer, daycareVisit, groomAppointment, lineIdentity, ownerProfile, pet, stay } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { asc, eq, ilike, inArray, like, or, type SQL, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** 05#ep-search.quick: at most 20 results */
const LIMIT = 20;
const PHONE_LIKE_RE = /^\+?[\d\s\-()]+$/;
const MODULE_ORDER: ServiceScope[] = ["grooming", "hotel", "daycare"];

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * E.164 prefix for a phone-shaped term (R-22): a full number normalizes exactly; a partial one gets the
 * same trunk handling (0X… / 66X… / +66X… → +66X…, other +… kept) so typing the first digits already matches.
 */
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

const customerName = (o: { firstName: string; nickname: string | null }) => (o.nickname ? `${o.firstName} (${o.nickname})` : o.firstName);

export async function searchQuick(ctx: RequestContext, input: SearchQuickRequest): Promise<SearchQuickResponse> {
  requireRole(ctx, "search.quick");
  const db = getDb();
  const q = input.q.trim();
  const pattern = `%${escapeLike(q)}%`;

  // ---- customers: ILIKE on owner name/nickname, prefix on phone, ILIKE on any of the owner's pets
  const ownerMatch: SQL[] = [
    ilike(ownerProfile.firstName, pattern),
    ilike(ownerProfile.lastName, pattern),
    ilike(ownerProfile.nickname, pattern),
  ];
  const prefix = phonePrefix(q);
  if (prefix) ownerMatch.push(like(ownerProfile.phoneE164, `${escapeLike(prefix)}%`));
  const matched = or(
    inArray(
      customer.ownerProfileId,
      db
        .select({ id: ownerProfile.id })
        .from(ownerProfile)
        .where(or(...ownerMatch)),
    ),
    inArray(customer.ownerProfileId, db.select({ id: pet.ownerProfileId }).from(pet).where(ilike(pet.name, pattern))),
  );
  const customers = (await tenantDb(ctx, db)
    .select(customer, matched)
    .orderBy(sql`${customer.lastVisitAt} desc nulls last`, asc(customer.id))
    .limit(LIMIT)) as (typeof customer.$inferSelect)[];

  // ---- bookings: exact booking_no
  const bookings = (await tenantDb(ctx, db)
    .select(booking, eq(booking.bookingNo, q))
    .orderBy(asc(booking.createdAt), asc(booking.id))
    .limit(LIMIT)) as (typeof booking.$inferSelect)[];
  const bookingCustomers = bookings.length
    ? ((await tenantDb(ctx, db).select(
        customer,
        inArray(customer.id, [...new Set(bookings.map((b) => b.customerId))]),
      )) as (typeof customer.$inferSelect)[])
    : [];

  // owner_profile / pet / line_identity are shared tables; reached through the tenant-checked customers above
  const ownerIds = [...new Set([...customers, ...bookingCustomers].map((c) => c.ownerProfileId))];
  const owners = ownerIds.length ? await db.select().from(ownerProfile).where(inArray(ownerProfile.id, ownerIds)) : [];
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const customerOwnerIds = [...new Set(customers.map((c) => c.ownerProfileId))];
  const pets = customerOwnerIds.length
    ? await db
        .select({ id: pet.id, name: pet.name, species: pet.species, ownerProfileId: pet.ownerProfileId })
        .from(pet)
        .where(inArray(pet.ownerProfileId, customerOwnerIds))
        .orderBy(asc(pet.createdAt), asc(pet.id))
    : [];
  const linked = customerOwnerIds.length
    ? new Set(
        (
          await db
            .select({ ownerProfileId: lineIdentity.ownerProfileId })
            .from(lineIdentity)
            .where(inArray(lineIdentity.ownerProfileId, customerOwnerIds))
        ).map((l) => l.ownerProfileId),
      )
    : new Set<string>();

  const customerItems = customers.map((c): CustomerListItem => {
    const o = ownerById.get(c.ownerProfileId);
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

  return { customers: customerItems, bookings: await bookingItems(ctx, bookings, bookingCustomers, ownerById) };
}

async function bookingItems(
  ctx: RequestContext,
  bookings: (typeof booking.$inferSelect)[],
  customers: (typeof customer.$inferSelect)[],
  ownerById: Map<string, typeof ownerProfile.$inferSelect>,
): Promise<BookingListItem[]> {
  if (bookings.length === 0) return [];
  const db = getDb();
  const ids = bookings.map((b) => b.id);
  const tdb = tenantDb(ctx, db);
  const tagged = (rows: unknown[], module: ServiceScope) => (rows as { bookingId: string; petId: string }[]).map((r) => ({ ...r, module }));
  const services = [
    ...tagged(await tdb.select(groomAppointment, inArray(groomAppointment.bookingId, ids)), "grooming"),
    ...tagged(await tdb.select(stay, inArray(stay.bookingId, ids)), "hotel"),
    ...tagged(await tdb.select(daycareVisit, inArray(daycareVisit.bookingId, ids)), "daycare"),
  ];
  const petIds = [...new Set(services.map((s) => s.petId))];
  const petName = new Map(
    (petIds.length ? await db.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return bookings.map((b): BookingListItem => {
    const own = services.filter((s) => s.bookingId === b.id);
    const owner = ownerById.get(customerById.get(b.customerId)?.ownerProfileId ?? "");
    return {
      id: b.id,
      bookingNo: b.bookingNo,
      status: b.status,
      channel: b.channel,
      customerId: b.customerId,
      customerName: owner ? customerName(owner) : "",
      firstServiceAt: b.firstServiceAt?.toISOString() ?? null,
      modules: MODULE_ORDER.filter((m) => own.some((s) => s.module === m)),
      petNames: [...new Set(own.map((s) => petName.get(s.petId) ?? ""))],
      estimatedTotalSatang: b.estimatedTotalSatang,
      depositStatus: b.depositStatus,
      depositRequiredSatang: b.depositRequiredSatang,
      holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
      approvalDueAt: b.approvalDueAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
    };
  });
}
