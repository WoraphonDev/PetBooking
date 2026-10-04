import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { ReportCardDetail } from "@app/contracts/dto/report-card-detail";
import type { ReportCardsGetRequest, ReportCardsGetResponse } from "@app/contracts/endpoints/reportCards.get";
import {
  branch,
  branchPolicy,
  groomAppointment,
  groomAppointmentItem,
  pet,
  petPhoto,
  petShopProfile,
  reportCard,
  staffUser,
} from "@app/db/schema";
import { nextGroomDue } from "@app/domain/aftercare/next-groom";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customersGet } from "../customers/get.ts";
import { photoItem } from "../photos/list.ts";

type CardRow = typeof reportCard.$inferSelect;
type Appt = typeof groomAppointment.$inferSelect;

/** role staff works only on report cards they created (05 reportCards.list; also get/update) */
export const ownOnly = (ctx: RequestContext) =>
  ctx.actor.role === "staff" && ctx.actor.id ? eq(reportCard.createdBy, ctx.actor.id) : undefined;

/** ReportCardDetail: PetSummary, groomer (appointment groomer, else the author), photos by kind, services, R-17 next due, review link. */
export async function reportCardDetail(ctx: RequestContext, db: Executor, c: CardRow): Promise<ReportCardDetail> {
  const repo = tenantDb(ctx, db);
  const pets = new Map<string, PetSummary>((await customersGet(ctx, { customerId: c.customerId })).pets.map((p) => [p.id, p]));
  const pet0 = pets.get(c.petId);
  if (!pet0) throw new AppError("NOT_FOUND");
  const [appt] = c.appointmentId ? ((await repo.select(groomAppointment, eq(groomAppointment.id, c.appointmentId))) as Appt[]) : [];
  const [groomer] = (await repo.select(staffUser, eq(staffUser.id, appt?.groomerId ?? c.createdBy))) as (typeof staffUser.$inferSelect)[];
  const items = appt
    ? ((await repo
        .select(groomAppointmentItem, eq(groomAppointmentItem.appointmentId, appt.id))
        .orderBy(asc(groomAppointmentItem.isAddon), asc(groomAppointmentItem.createdAt))) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  const photoWhere = c.appointmentId ? eq(petPhoto.appointmentId, c.appointmentId) : c.stayId ? eq(petPhoto.stayId, c.stayId) : undefined;
  const photos = photoWhere
    ? ((await repo.select(petPhoto, photoWhere).orderBy(asc(petPhoto.takenAt), asc(petPhoto.id))) as (typeof petPhoto.$inferSelect)[])
    : [];
  const photoItems = await Promise.all(photos.map(async (p) => ({ kind: p.kind, item: await photoItem(ctx, db, p) })));

  // R-17 for the pet at this shop
  const [br] = (await repo.select(branch, eq(branch.id, c.branchId))) as (typeof branch.$inferSelect)[];
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, c.branchId));
  const visits = (await repo.select(
    groomAppointment,
    and(eq(groomAppointment.petId, c.petId), inArray(groomAppointment.status, ["done", "picked_up"])),
  )) as Appt[];
  const future = await repo.select(
    groomAppointment,
    and(
      eq(groomAppointment.petId, c.petId),
      gt(groomAppointment.startsAt, ctx.now),
      notInArray(groomAppointment.status, ["cancelled", "no_show"]),
    ),
  );
  const [profile] = (await repo.select(petShopProfile, eq(petShopProfile.petId, c.petId))) as (typeof petShopProfile.$inferSelect)[];
  // pet has no organization_id: reached through the org-checked report card
  const [p] = await db.select({ status: pet.status }).from(pet).where(eq(pet.id, c.petId));
  const tz = br?.timezone ?? ctx.timezone;
  const due = nextGroomDue({
    visitDates: visits.map((v) => toLocalDate({ instant: v.startsAt.toISOString(), timezone: tz })).sort(),
    shopIntervalDays: profile?.groomIntervalDays ?? null,
    defaultDays: policy?.nextGroomDefaultDays ?? 28,
    hasFutureAppointment: future.length > 0,
    petStatus: p?.status ?? "active",
  });

  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    pet: pet0,
    appointmentId: c.appointmentId,
    stayId: c.stayId,
    skin: c.skin,
    ears: c.ears,
    nails: c.nails,
    teeth: c.teeth,
    parasites: c.parasites,
    cooperation: c.cooperation,
    staffNote: c.staffNote,
    recommendation: c.recommendation,
    groomerName: groomer?.displayName ?? "",
    beforePhotos: photoItems.filter((x) => x.kind === "before").map((x) => x.item),
    // a stay report shows its stay photos as "after"
    afterPhotos: photoItems.filter((x) => x.kind === "after" || x.kind === "stay").map((x) => x.item),
    services: items.map((i) => i.nameSnapshot),
    nextGroomDue: due.dueDate,
    sentAt: c.sentAt?.toISOString() ?? null,
    customerRating: c.customerRating,
    customerFeedback: c.customerFeedback,
    googleReviewUrl: policy?.googleReviewUrl ?? null,
  };
}

/** a report card of this org (and of the caller when role staff) or NOT_FOUND */
export async function findReportCard(ctx: RequestContext, db: Executor, id: string): Promise<CardRow> {
  const own = ownOnly(ctx);
  const [c] = (await tenantDb(ctx, db).select(reportCard, own ? and(eq(reportCard.id, id), own) : eq(reportCard.id, id))) as CardRow[];
  if (!c) throw new AppError("NOT_FOUND");
  return c;
}

/** 05#ep-reportCards.get */
export async function reportCardsGet(ctx: RequestContext, input: ReportCardsGetRequest): Promise<ReportCardsGetResponse> {
  requireRole(ctx, "reportCards.get");
  const db = getDb();
  return reportCardDetail(ctx, db, await findReportCard(ctx, db, input.reportCardId));
}
