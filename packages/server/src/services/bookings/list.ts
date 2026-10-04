import type { BookingListItem } from "@app/contracts/dto/booking-list-item";
import type { BookingsListRequest, BookingsListResponse } from "@app/contracts/endpoints/bookings.list";
import type { ServiceScope } from "@app/contracts/enums";
import { booking, branch, customer, daycareVisit, groomAppointment, ownerProfile, pet, stay } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const MODULE_ORDER: ServiceScope[] = ["grooming", "hotel", "daycare"];
/** a booking without a service time yet sorts by its creation (ms precision, like the cursor) */
const listedAt = sql<Date>`date_trunc('milliseconds', coalesce(${booking.firstServiceAt}, ${booking.createdAt}))`;

// keyset cursor = base64url(JSON [listedAt ISO, id]) of the last row of the previous page
function decodeCursor(cursor: string): [string, string] {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      typeof v[0] === "string" &&
      !Number.isNaN(Date.parse(v[0])) &&
      /^[0-9a-f-]{36}$/i.test(String(v[1]))
    )
      return [v[0], v[1]];
  } catch {}
  throw new AppError("VALIDATION_FAILED", { fields: { cursor: "invalid cursor" } });
}
const encodeCursor = (at: Date, id: string) => Buffer.from(JSON.stringify([at.toISOString(), id])).toString("base64url");
const customerName = (o: { firstName: string; nickname: string | null }) => (o.nickname ? `${o.firstName} (${o.nickname})` : o.firstName);

/** 05#ep-bookings.list: bookings of the session branch, latest service first; from/to are branch-local days of first_service_at. */
export async function bookingsList(ctx: RequestContext, input: BookingsListRequest): Promise<BookingsListResponse> {
  requireRole(ctx, "bookings.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");

  const where: SQL[] = [eq(booking.branchId, br.id)];
  if (input.status?.length) where.push(inArray(booking.status, input.status));
  if (input.customerId) where.push(eq(booking.customerId, input.customerId));
  if (input.from) where.push(sql`${booking.firstServiceAt} >= ${localDayBounds({ date: input.from, timezone: br.timezone }).start}`);
  if (input.to) where.push(sql`${booking.firstServiceAt} < ${localDayBounds({ date: input.to, timezone: br.timezone }).end}`);
  if (input.cursor) {
    const [at, id] = decodeCursor(input.cursor);
    where.push(sql`(${listedAt} < ${at} or (${listedAt} = ${at} and ${booking.id} < ${id}))`);
  }
  const rows = (await db
    .select(booking, and(...where))
    .orderBy(sql`${listedAt} desc`, sql`${booking.id} desc`)
    .limit(input.limit + 1)) as (typeof booking.$inferSelect)[];
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: await listItems(ctx, page),
    nextCursor: rows.length > input.limit && last ? encodeCursor(last.firstServiceAt ?? last.createdAt, last.id) : null,
  };
}

async function listItems(ctx: RequestContext, bookings: (typeof booking.$inferSelect)[]): Promise<BookingListItem[]> {
  if (bookings.length === 0) return [];
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const ids = bookings.map((b) => b.id);
  const tagged = (rows: unknown[], module: ServiceScope) => (rows as { bookingId: string; petId: string }[]).map((r) => ({ ...r, module }));
  const services = [
    ...tagged(await db.select(groomAppointment, inArray(groomAppointment.bookingId, ids)), "grooming"),
    ...tagged(await db.select(stay, inArray(stay.bookingId, ids)), "hotel"),
    ...tagged(await db.select(daycareVisit, inArray(daycareVisit.bookingId, ids)), "daycare"),
  ];
  // pet / owner_profile are shared across shops; reached through the tenant-checked bookings and customers
  const petIds = [...new Set(services.map((s) => s.petId))];
  const petName = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const customers = (await db.select(
    customer,
    inArray(customer.id, [...new Set(bookings.map((b) => b.customerId))]),
  )) as (typeof customer.$inferSelect)[];
  const owners = customers.length
    ? await tx
        .select()
        .from(ownerProfile)
        .where(
          inArray(
            ownerProfile.id,
            customers.map((c) => c.ownerProfileId),
          ),
        )
    : [];
  const ownerOf = (customerId: string) => owners.find((o) => o.id === customers.find((c) => c.id === customerId)?.ownerProfileId);

  return bookings.map((b) => {
    const own = services.filter((s) => s.bookingId === b.id);
    const owner = ownerOf(b.customerId);
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
