import type { StayDetail } from "@app/contracts/dto/stay-detail";
import type { StaysGetRequest, StaysGetResponse } from "@app/contracts/endpoints/stays.get";
import { careTask, consentDocument, petPhoto, staffUser, stay, stayAddon, stayBelonging, stayIntake, stayMedication } from "@app/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";
import { photoItem } from "../photos/list.ts";

const hhmm = (t: string) => t.slice(0, 5);

/** 05#dto-StayDetail: the StayCard from bookingDetail plus intake, medications, belongings, add-ons, tasks, photos, agreement */
export async function stayDetail(ctx: RequestContext, db: Executor, stayId: string): Promise<StayDetail> {
  const repo = tenantDb(ctx, db);
  const [s] = (await repo.select(stay, eq(stay.id, stayId))) as (typeof stay.$inferSelect)[];
  if (!s) throw new AppError("NOT_FOUND");
  const card = (await bookingDetail(ctx, db, s.bookingId)).stays.find((x) => x.id === s.id);
  if (!card) throw new AppError("NOT_FOUND");

  const [intake] = (await repo.select(stayIntake, eq(stayIntake.stayId, s.id))) as (typeof stayIntake.$inferSelect)[];
  const meds = (await repo
    .select(stayMedication, eq(stayMedication.stayId, s.id))
    .orderBy(asc(stayMedication.createdAt), asc(stayMedication.id))) as (typeof stayMedication.$inferSelect)[];
  const belongings = (await repo
    .select(stayBelonging, eq(stayBelonging.stayId, s.id))
    .orderBy(asc(stayBelonging.createdAt), asc(stayBelonging.id))) as (typeof stayBelonging.$inferSelect)[];
  const addons = (await repo
    .select(stayAddon, eq(stayAddon.stayId, s.id))
    .orderBy(asc(stayAddon.createdAt), asc(stayAddon.id))) as (typeof stayAddon.$inferSelect)[];
  const tasks = (await repo
    .select(careTask, eq(careTask.stayId, s.id))
    .orderBy(asc(careTask.dueAt), asc(careTask.id))) as (typeof careTask.$inferSelect)[];
  const doers = unique(tasks.flatMap((t) => (t.doneBy ? [t.doneBy] : [])));
  const staff = doers.length ? ((await repo.select(staffUser, inArray(staffUser.id, doers))) as (typeof staffUser.$inferSelect)[]) : [];
  const photos = (await repo
    .select(petPhoto, eq(petPhoto.stayId, s.id))
    .orderBy(asc(petPhoto.takenAt), asc(petPhoto.id))) as (typeof petPhoto.$inferSelect)[];
  // consent documents are immutable: a new signature is a new row, the latest one counts
  const [agreement] = (await repo
    .select(consentDocument, and(eq(consentDocument.stayId, s.id), eq(consentDocument.kind, "boarding_agreement")))
    .orderBy(desc(consentDocument.signedAt), desc(consentDocument.createdAt))
    .limit(1)) as (typeof consentDocument.$inferSelect)[];
  const url = (id: string | null) => (id ? signedUrl(db, ctx, id) : Promise.resolve(null));

  return {
    stay: card,
    weightGramsIn: s.weightGramsIn,
    weightGramsOut: s.weightGramsOut,
    vaccineOverrideReason: s.vaccineOverrideReason,
    checkedInAt: s.checkedInAt?.toISOString() ?? null,
    checkedOutAt: s.checkedOutAt?.toISOString() ?? null,
    intake: intake
      ? {
          foodBrand: intake.foodBrand,
          foodAmount: intake.foodAmount,
          feedingTimes: intake.feedingTimes.map(hhmm),
          foodProvidedByOwner: intake.foodProvidedByOwner,
          walksPerDay: intake.walksPerDay,
          conditionNote: intake.conditionNote,
          conditionPhotoUrls: await Promise.all(intake.conditionPhotoIds.map((id) => signedUrl(db, ctx, id))),
          emergencyContactName: intake.emergencyContactName,
          emergencyContactPhone: intake.emergencyContactPhone,
          vetClinicName: intake.vetClinicName,
          vetClinicPhone: intake.vetClinicPhone,
          completedAt: intake.completedAt?.toISOString() ?? null,
        }
      : null,
    medications: meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, times: m.times.map(hhmm), instructions: m.instructions })),
    belongings: await Promise.all(
      belongings.map(async (b) => ({
        id: b.id,
        item: b.item,
        quantity: b.quantity,
        photoUrl: await url(b.photoFileId),
        returnedAt: b.returnedAt?.toISOString() ?? null,
      })),
    ),
    addons: addons.map((a) => ({ id: a.id, name: a.nameSnapshot, quantity: a.quantity, totalSatang: a.totalSatang })),
    tasks: await Promise.all(
      tasks.map(async (t) => {
        const med = t.medicationId ? meds.find((m) => m.id === t.medicationId) : undefined;
        return {
          id: t.id,
          stayId: s.id,
          petName: card.pet.name,
          roomCode: card.roomCode,
          taskType: t.taskType,
          title: t.title,
          dueAt: t.dueAt.toISOString(),
          status: t.status,
          doneAt: t.doneAt?.toISOString() ?? null,
          doneByName: staff.find((x) => x.id === t.doneBy)?.displayName ?? null,
          note: t.note,
          photoUrl: await url(t.photoFileId),
          medication: med ? `${med.name} ${med.dose}` : null,
        };
      }),
    ),
    updates: await Promise.all(photos.map((p) => photoItem(ctx, db, p))),
    agreement: agreement
      ? {
          signerName: agreement.signerName,
          signedAt: agreement.signedAt.toISOString(),
          emergencyVetLimitSatang: agreement.emergencyVetLimitSatang,
        }
      : null,
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** 05#ep-stays.get */
export async function staysGet(ctx: RequestContext, input: StaysGetRequest): Promise<StaysGetResponse> {
  requireRole(ctx, "stays.get");
  return stayDetail(ctx, getDb(), input.stayId);
}
