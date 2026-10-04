import type { GroomJobCardRequest, GroomJobCardResponse } from "@app/contracts/endpoints/groom.jobCard";
import { booking, consentDocument, groomAppointment, petPhoto, petShopProfile, petTemperamentFlag } from "@app/db/schema";
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { appointmentCards } from "../bookings/get.ts";
import { photoItem } from "../photos/list.ts";

type Appt = typeof groomAppointment.$inferSelect;

/**
 * 05#dto-JobCard for one appointment: the card, this shop's pet profile and flags, check-in condition, the customer's
 * note, this visit's photos, the previous done/picked-up visit (photos + staff note) and whether a consent was signed.
 */
export async function groomJobCard(ctx: RequestContext, input: GroomJobCardRequest): Promise<GroomJobCardResponse> {
  requireRole(ctx, "groom.jobCard");
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
  if (!a) throw new AppError("NOT_FOUND");
  const [card] = await appointmentCards(ctx, tx, [a]);
  if (!card) throw new AppError("NOT_FOUND");
  const [bk] = (await db.select(booking, eq(booking.id, a.bookingId))) as (typeof booking.$inferSelect)[];
  const [profile] = (await db.select(petShopProfile, eq(petShopProfile.petId, a.petId))) as (typeof petShopProfile.$inferSelect)[];
  const flags = (await db.select(petTemperamentFlag, eq(petTemperamentFlag.petId, a.petId))) as (typeof petTemperamentFlag.$inferSelect)[];
  const consents = await db.select(consentDocument, eq(consentDocument.appointmentId, a.id));

  const photosOf = async (appointmentId: string) => {
    const rows = (await db
      .select(petPhoto, eq(petPhoto.appointmentId, appointmentId))
      .orderBy(asc(petPhoto.takenAt), asc(petPhoto.id))) as (typeof petPhoto.$inferSelect)[];
    return Promise.all(rows.map((r) => photoItem(ctx, tx, r)));
  };
  const [previous] = (await db
    .select(
      groomAppointment,
      and(
        eq(groomAppointment.petId, a.petId),
        ne(groomAppointment.id, a.id),
        inArray(groomAppointment.status, ["done", "picked_up"]),
        lt(groomAppointment.startsAt, a.startsAt),
      ),
    )
    .orderBy(desc(groomAppointment.startsAt))
    .limit(1)) as Appt[];
  const [favorite] = profile?.favoriteStylePhotoId
    ? ((await db.select(petPhoto, eq(petPhoto.id, profile.favoriteStylePhotoId))) as (typeof petPhoto.$inferSelect)[])
    : [];

  return {
    appointment: card,
    preferredStyle: profile?.preferredStyle ?? null,
    bladeNo: profile?.bladeNo ?? null,
    shampooOk: profile?.shampooOk ?? null,
    shampooAvoid: profile?.shampooAvoid ?? null,
    allergies: profile?.allergies ?? null,
    conditions: profile?.conditions ?? null,
    internalNote: profile?.internalNote ?? null,
    favoriteStylePhotoUrl: favorite ? (await photoItem(ctx, tx, favorite)).url : null,
    flags: flags.map((f) => ({ flag: f.flag, note: f.note })),
    weightGramsCheckin: a.weightGramsCheckin,
    conditionFlags: a.conditionFlags,
    conditionNote: a.conditionNote,
    customerNote: bk?.customerNote ?? null,
    lastVisit: previous ? { photos: await photosOf(previous.id), staffNote: previous.staffNote } : null,
    photos: await photosOf(a.id),
    consentSigned: consents.length > 0,
  };
}
