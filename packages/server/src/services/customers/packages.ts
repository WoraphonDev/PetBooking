import type { CustomersPackagesRequest, CustomersPackagesResponse } from "@app/contracts/endpoints/customers.packages";
import { bill, billLine, customer, customerPackage, packageRedemption, packageTemplate, pet, staffUser } from "@app/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const unique = <T>(xs: T[]) => [...new Set(xs)];

/** Every package the customer holds or held (any status): active first, then newest purchase. */
export async function customersPackages(ctx: RequestContext, input: CustomersPackagesRequest): Promise<CustomersPackagesResponse> {
  requireRole(ctx, "customers.packages");
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const [c] = await db.select(customer, eq(customer.id, input.customerId));
  if (!c) throw new AppError("NOT_FOUND");

  const packages = (await db
    .select(customerPackage, eq(customerPackage.customerId, input.customerId))
    .orderBy(
      sql`case when ${customerPackage.status} = 'active' then 0 else 1 end`,
      desc(customerPackage.purchasedAt),
      desc(customerPackage.id),
    )) as (typeof customerPackage.$inferSelect)[];
  if (packages.length === 0) return [];
  const templates = (await db.select(
    packageTemplate,
    inArray(packageTemplate.id, unique(packages.map((p) => p.templateId))),
  )) as (typeof packageTemplate.$inferSelect)[];
  const redemptions = (await db
    .select(
      packageRedemption,
      inArray(
        packageRedemption.customerPackageId,
        packages.map((p) => p.id),
      ),
    )
    .orderBy(asc(packageRedemption.redeemedAt), asc(packageRedemption.id))) as (typeof packageRedemption.$inferSelect)[];
  const lineIds = unique(redemptions.map((r) => r.billLineId));
  const lines = lineIds.length ? ((await db.select(billLine, inArray(billLine.id, lineIds))) as (typeof billLine.$inferSelect)[]) : [];
  const billIds = unique(lines.map((l) => l.billId));
  const bills = billIds.length ? ((await db.select(bill, inArray(bill.id, billIds))) as (typeof bill.$inferSelect)[]) : [];
  const performerIds = unique(redemptions.flatMap((r) => (r.performerId ? [r.performerId] : [])));
  const performers = performerIds.length
    ? ((await db.select(staffUser, inArray(staffUser.id, performerIds))) as (typeof staffUser.$inferSelect)[])
    : [];
  // pet is a shared table; ids come from the tenant-checked packages / redemptions
  const petIds = unique([...packages, ...redemptions].flatMap((x) => (x.petId ? [x.petId] : [])));
  const petName = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const receiptOf = (billLineId: string) => bills.find((b) => b.id === lines.find((l) => l.id === billLineId)?.billId)?.receiptNo ?? null;

  return packages.map((p) => ({
    id: p.id,
    templateName: templates.find((t) => t.id === p.templateId)?.nameTh ?? "",
    petId: p.petId,
    petName: p.petId ? (petName.get(p.petId) ?? null) : null,
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: p.sessionsUsed,
    sessionsLeft: p.sessionsTotal - p.sessionsUsed,
    expiresAt: p.expiresAt.toISOString(),
    status: p.status,
    redemptions: redemptions
      .filter((r) => r.customerPackageId === p.id)
      .map((r) => ({
        redeemedAt: r.redeemedAt.toISOString(),
        petName: r.petId ? (petName.get(r.petId) ?? null) : null,
        performerName: performers.find((s) => s.id === r.performerId)?.displayName ?? null,
        receiptNo: receiptOf(r.billLineId),
        reversedAt: r.reversedAt?.toISOString() ?? null,
      })),
  }));
}
