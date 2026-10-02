import type { BillListItem } from "@app/contracts/dto/bill-list-item";
import type { BillsListRequest, BillsListResponse } from "@app/contracts/endpoints/bills.list";
import { bill, branch, customer, ownerProfile, payment } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Q-0055: a paid bill is dated by closed_at, an open or void bill by opened_at (ms precision, like the cursor) */
const listedAt = sql<Date>`date_trunc('milliseconds', case when ${bill.status} = 'paid' then ${bill.closedAt} else ${bill.openedAt} end)`;

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

/** Bills of the session branch, newest first (05#ep-bills.list). */
export async function billsList(ctx: RequestContext, input: BillsListRequest): Promise<BillsListResponse> {
  requireRole(ctx, "bills.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");

  const where: SQL[] = [eq(bill.branchId, br.id)];
  if (input.status) where.push(eq(bill.status, input.status));
  if (input.date) {
    const { start, end } = localDayBounds({ date: input.date, timezone: br.timezone });
    where.push(sql`${listedAt} >= ${start} and ${listedAt} < ${end}`);
  }
  if (input.cursor) {
    const [at, id] = decodeCursor(input.cursor);
    where.push(sql`(${listedAt} < ${at} or (${listedAt} = ${at} and ${bill.id} < ${id}))`);
  }
  const rows = (await db
    .select(bill, and(...where))
    .orderBy(sql`${listedAt} desc`, sql`${bill.id} desc`)
    .limit(input.limit + 1)) as (typeof bill.$inferSelect)[];
  const page = rows.slice(0, input.limit);

  const customerIds = [...new Set(page.flatMap((b) => (b.customerId ? [b.customerId] : [])))];
  const customers = customerIds.length
    ? ((await db.select(customer, inArray(customer.id, customerIds))) as (typeof customer.$inferSelect)[])
    : [];
  // owner_profile is shared across shops; reached through the tenant-checked customers
  const owners = customers.length
    ? await tx
        .select({ id: ownerProfile.id, firstName: ownerProfile.firstName })
        .from(ownerProfile)
        .where(
          inArray(
            ownerProfile.id,
            customers.map((c) => c.ownerProfileId),
          ),
        )
    : [];
  const nameOf = (customerId: string | null) => {
    const ownerId = customers.find((c) => c.id === customerId)?.ownerProfileId;
    return owners.find((o) => o.id === ownerId)?.firstName ?? null;
  };
  const payments = page.length
    ? ((await db.select(
        payment,
        and(
          inArray(
            payment.billId,
            page.map((b) => b.id),
          ),
          eq(payment.status, "posted"),
        ),
      )) as (typeof payment.$inferSelect)[])
    : [];

  const items: BillListItem[] = page.map((b) => ({
    id: b.id,
    receiptNo: b.receiptNo,
    status: b.status,
    customerName: nameOf(b.customerId),
    totalSatang: b.totalSatang,
    paidSatang: b.paidSatang,
    openedAt: b.openedAt.toISOString(),
    closedAt: b.closedAt?.toISOString() ?? null,
    methods: [...new Set(payments.filter((p) => p.billId === b.id).map((p) => p.method))],
  }));
  const last = page.at(-1);
  const lastAt = last && (last.status === "paid" && last.closedAt ? last.closedAt : last.openedAt);
  return { items, nextCursor: rows.length > input.limit && last && lastAt ? encodeCursor(lastAt, last.id) : null };
}
