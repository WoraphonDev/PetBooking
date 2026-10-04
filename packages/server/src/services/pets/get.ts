import { PetDetail } from "@app/contracts/dto/pet-detail";
import type { PetsGetRequest, PetsGetResponse } from "@app/contracts/endpoints/pets.get";
import {
  branch,
  branchPolicy,
  groomAppointment,
  pet,
  petPhoto,
  petShopProfile,
  petTemperamentFlag,
  petVaccination,
  petWeight,
  vaccineType,
} from "@app/db/schema";
import { nextGroomDue } from "@app/domain/aftercare/next-groom";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, desc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
export async function requirePet(ctx: RequestContext, tx: Executor, petId: string) {
  if (!ctx.orgId) throw new AppError("NOT_FOUND");
  const [shop] = (await tenantDb(ctx, tx).select(
    petShopProfile,
    eq(petShopProfile.petId, petId),
  )) as (typeof petShopProfile.$inferSelect)[];
  if (!shop) throw new AppError("NOT_FOUND");
  const [p] = await tx.select().from(pet).where(eq(pet.id, shop.petId));
  if (!p) throw new AppError("NOT_FOUND");
  return { p, shop };
}
export async function petDetail(ctx: RequestContext, tx: Executor, petId: string): Promise<PetDetail> {
  const { p, shop } = await requirePet(ctx, tx, petId);
  const db = tenantDb(ctx, tx);
  const flags = await db.select(petTemperamentFlag, eq(petTemperamentFlag.petId, petId));
  const weights = (await db
    .select(petWeight, eq(petWeight.petId, petId))
    .orderBy(desc(petWeight.measuredAt), desc(petWeight.id))) as (typeof petWeight.$inferSelect)[];
  const vaccinations = await tx
    .select({ row: petVaccination, vaccineName: vaccineType.nameTh })
    .from(petVaccination)
    .innerJoin(vaccineType, eq(vaccineType.code, petVaccination.vaccineCode))
    .where(eq(petVaccination.petId, petId));
  const visits = (await db.select(groomAppointment, eq(groomAppointment.petId, petId))) as (typeof groomAppointment.$inferSelect)[];
  const [br] = ctx.branchId ? await db.select(branch, eq(branch.id, ctx.branchId)) : [];
  if (!br) throw new AppError("NOT_FOUND");
  const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, ctx.branchId!));
  const [favorite] = shop.favoriteStylePhotoId
    ? ((await db.select(
        petPhoto,
        and(eq(petPhoto.id, shop.favoriteStylePhotoId), eq(petPhoto.petId, petId)),
      )) as (typeof petPhoto.$inferSelect)[])
    : [];
  return PetDetail.parse({
    ...p,
    photoUrl: p.profileFileId ? await signedUrl(tx, ctx, p.profileFileId) : null,
    shop: {
      ...shop,
      favoriteStylePhotoUrl: favorite ? await signedUrl(tx, ctx, favorite.fileId) : null,
      lastGroomedAt: shop.lastGroomedAt?.toISOString() ?? null,
    },
    flags,
    weights: weights.map((w) => ({ ...w, measuredAt: w.measuredAt.toISOString() })),
    vaccinations: await Promise.all(
      vaccinations.map(async ({ row, vaccineName }) => ({
        ...row,
        vaccineName,
        proofUrl: row.proofFileId ? await signedUrl(tx, ctx, row.proofFileId) : null,
      })),
    ),
    nextGroomDue: nextGroomDue({
      visitDates: visits
        .filter((v) => v.status === "done" || v.status === "picked_up")
        .map((v) => toLocalDate({ instant: v.startsAt.toISOString(), timezone: ctx.timezone })),
      shopIntervalDays: shop.groomIntervalDays,
      defaultDays: policy?.nextGroomDefaultDays ?? 28,
      hasFutureAppointment: visits.some((v) => v.startsAt > ctx.now && v.status !== "cancelled" && v.status !== "no_show"),
      petStatus: p.status,
    }).dueDate,
  });
}
export async function petsGet(ctx: RequestContext, input: PetsGetRequest): Promise<PetsGetResponse> {
  requireRole(ctx, "pets.get");
  return petDetail(ctx, getDb(), input.petId);
}
