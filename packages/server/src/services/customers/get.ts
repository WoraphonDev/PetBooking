import type { BookingListItem } from "@app/contracts/dto/booking-list-item";
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { CustomerPackageItem } from "@app/contracts/dto/customer-package-item";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { CustomersGetRequest, CustomersGetResponse } from "@app/contracts/endpoints/customers.get";
import type { ServiceScope } from "@app/contracts/enums";
import {
  bill,
  billLine,
  booking,
  branch,
  branchPolicy,
  customer,
  customerPackage,
  daycareVisit,
  groomAppointment,
  lineIdentity,
  ownerProfile,
  packageRedemption,
  packageTemplate,
  pet,
  petTemperamentFlag,
  petVaccination,
  staffUser,
  stay,
} from "@app/db/schema";
import { ageInMonths } from "@app/domain/booking/eligibility";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** bookings that still lie ahead (03 booking states before cancelled/expired/closed) */
const UPCOMING = ["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"] as const;
const MODULE_ORDER: ServiceScope[] = ["grooming", "hotel", "daycare"];
/** 05#ep-customers.get: role staff does not see these keys */
const STAFF_HIDDEN = [
  "phone",
  "email",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
  "internalNote",
  "creditBalanceSatang",
] as const;

const iso = (d: Date | null) => d?.toISOString() ?? null;
const unique = <T>(xs: T[]) => [...new Set(xs)];

async function petSummaries(ctx: RequestContext, tx: Executor, ownerProfileId: string): Promise<PetSummary[]> {
  const pets = await tx.select().from(pet).where(eq(pet.ownerProfileId, ownerProfileId)).orderBy(asc(pet.createdAt), asc(pet.id));
  if (pets.length === 0) return [];
  const ids = pets.map((p) => p.id);
  const flags = (await tenantDb(ctx, tx).select(
    petTemperamentFlag,
    inArray(petTemperamentFlag.petId, ids),
  )) as (typeof petTemperamentFlag.$inferSelect)[];
  // pet / pet_vaccination are shared across shops; reached through the tenant-checked customer
  const vaccinations = await tx.select().from(petVaccination).where(inArray(petVaccination.petId, ids));
  // branch_policy has no organization_id: read it through the tenant-checked branch
  const [scopedBranch] = ctx.branchId
    ? ((await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[])
    : [];
  const [policy] = scopedBranch ? await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, scopedBranch.id)) : [];
  const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: ctx.timezone });

  return pets.map((p) => {
    const required =
      p.species === "dog" ? (policy?.requiredVaccinesDog ?? []) : p.species === "cat" ? (policy?.requiredVaccinesCat ?? []) : [];
    const gate = checkVaccines({
      requiredCodes: required,
      vaccinations: vaccinations
        .filter((v) => v.petId === p.id)
        .map((v) => ({ code: v.vaccineCode, expiresOn: v.expiresOn, status: v.status })),
      mustBeValidOn: today,
    });
    return {
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      sex: p.sex,
      coatType: p.coatType,
      latestWeightGrams: p.latestWeightGrams,
      status: p.status,
      // signed URL needs object storage (T-0038) — null until then
      photoUrl: null,
      flags: unique(flags.filter((f) => f.petId === p.id).map((f) => f.flag)),
      ageMonths: ageInMonths({
        onDate: today,
        birthDate: p.birthDate,
        ageEstimateMonths: p.ageEstimateMonths,
        estimateRecordedOn: toLocalDate({ instant: p.createdAt.toISOString(), timezone: ctx.timezone }),
      }),
      // ok; any required code without a record → missing; expired / pending review only → warning
      vaccineStatus: gate.ok ? "ok" : gate.missing.length ? "missing" : "warning",
    };
  });
}

async function activePackages(ctx: RequestContext, tx: Executor, customerId: string): Promise<CustomerPackageItem[]> {
  const db = tenantDb(ctx, tx);
  const packages = (await db
    .select(customerPackage, and(eq(customerPackage.customerId, customerId), eq(customerPackage.status, "active")))
    .orderBy(asc(customerPackage.expiresAt), asc(customerPackage.id))) as (typeof customerPackage.$inferSelect)[];
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
  const petIds = unique([...packages, ...redemptions].flatMap((x) => (x.petId ? [x.petId] : [])));
  const petName = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const receiptOf = (billLineId: string) => {
    const line = lines.find((l) => l.id === billLineId);
    return bills.find((b) => b.id === line?.billId)?.receiptNo ?? null;
  };

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
        reversedAt: iso(r.reversedAt),
      })),
  }));
}

async function upcomingBookings(ctx: RequestContext, tx: Executor, customerId: string, customerName: string): Promise<BookingListItem[]> {
  const db = tenantDb(ctx, tx);
  const bookings = (await db
    .select(booking, and(eq(booking.customerId, customerId), inArray(booking.status, [...UPCOMING]), gte(booking.firstServiceAt, ctx.now)))
    .orderBy(asc(booking.firstServiceAt), asc(booking.id))) as (typeof booking.$inferSelect)[];
  if (bookings.length === 0) return [];
  const ids = bookings.map((b) => b.id);
  const tagged = (rows: unknown[], module: ServiceScope) => (rows as { bookingId: string; petId: string }[]).map((r) => ({ ...r, module }));
  const services = [
    ...tagged(await db.select(groomAppointment, inArray(groomAppointment.bookingId, ids)), "grooming"),
    ...tagged(await db.select(stay, inArray(stay.bookingId, ids)), "hotel"),
    ...tagged(await db.select(daycareVisit, inArray(daycareVisit.bookingId, ids)), "daycare"),
  ];
  const petIds = unique(services.map((s) => s.petId));
  const petName = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  return bookings.map((b) => {
    const own = services.filter((s) => s.bookingId === b.id);
    return {
      id: b.id,
      bookingNo: b.bookingNo,
      status: b.status,
      channel: b.channel,
      customerId: b.customerId,
      customerName,
      firstServiceAt: iso(b.firstServiceAt),
      modules: MODULE_ORDER.filter((m) => own.some((s) => s.module === m)),
      petNames: unique(own.map((s) => petName.get(s.petId) ?? "")),
      estimatedTotalSatang: b.estimatedTotalSatang,
      depositStatus: b.depositStatus,
      depositRequiredSatang: b.depositRequiredSatang,
      holdExpiresAt: iso(b.holdExpiresAt),
      approvalDueAt: iso(b.approvalDueAt),
      createdAt: b.createdAt.toISOString(),
    };
  });
}

/** Full CustomerDetail of a tenant-checked customer row (all keys; callers strip what a role may not see). */
export async function customerDetail(ctx: RequestContext, tx: Executor, c: typeof customer.$inferSelect): Promise<CustomerDetail> {
  const [owner] = await tx.select().from(ownerProfile).where(eq(ownerProfile.id, c.ownerProfileId));
  if (!owner) throw new AppError("NOT_FOUND");
  const [line] = await tx
    .select()
    .from(lineIdentity)
    .where(eq(lineIdentity.ownerProfileId, owner.id))
    .orderBy(asc(lineIdentity.createdAt), asc(lineIdentity.id))
    .limit(1);
  // 06 display: ชื่อ (ชื่อเล่น)
  const name = owner.nickname ? `${owner.firstName} (${owner.nickname})` : owner.firstName;
  return {
    id: c.id,
    ownerProfileId: owner.id,
    firstName: owner.firstName,
    lastName: owner.lastName,
    nickname: owner.nickname,
    phone: owner.phoneE164,
    email: owner.email,
    birthDate: owner.birthDate,
    addressLine: owner.addressLine,
    subdistrict: owner.subdistrict,
    district: owner.district,
    province: owner.province,
    postalCode: owner.postalCode,
    sourceChannel: c.sourceChannel,
    referralNote: c.referralNote,
    emergencyContactName: c.emergencyContactName,
    emergencyContactPhone: c.emergencyContactPhone,
    internalNote: c.internalNote,
    reliabilityLevel: c.reliabilityLevel,
    reliabilityOverride: c.reliabilityOverride,
    lateCancelCount12m: c.lateCancelCount12m,
    noShowCount12m: c.noShowCount12m,
    blacklisted: c.blacklisted,
    blacklistReason: c.blacklistReason,
    depositExempt: c.depositExempt,
    photoConsent: c.photoConsent,
    visitCount: c.visitCount,
    firstVisitAt: iso(c.firstVisitAt),
    lastVisitAt: iso(c.lastVisitAt),
    creditBalanceSatang: c.creditBalanceSatang,
    line: line ? { displayName: line.displayName, pictureUrl: line.pictureUrl, isFriend: line.isFriend } : null,
    pets: await petSummaries(ctx, tx, owner.id),
    activePackages: await activePackages(ctx, tx, c.id),
    upcomingBookings: await upcomingBookings(ctx, tx, c.id, name),
  };
}

export async function customersGet(ctx: RequestContext, input: CustomersGetRequest): Promise<CustomersGetResponse> {
  requireRole(ctx, "customers.get");
  const db = getDb();
  const [c] = (await tenantDb(ctx, db).select(customer, eq(customer.id, input.customerId))) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const detail = await customerDetail(ctx, db, c);
  if (ctx.actor.type === "staff" && ctx.actor.role === "staff") for (const key of STAFF_HIDDEN) delete detail[key];
  return detail;
}
