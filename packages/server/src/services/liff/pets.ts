import type { MyPet } from "@app/contracts/dto/my-pet";
import type { LiffPetsRequest, LiffPetsResponse } from "@app/contracts/endpoints/liff.pets";
import { customer, pet, petPhoto, petShopProfile } from "@app/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail } from "../pets/get.ts";

/** L-03 shows the shop's before/after/stay photos, not profile pictures */
const CUSTOMER_PHOTO_KINDS = ["before", "after", "stay"] as const;

/** The signed-in customer of this org (05 LIFF: actor.id = customer.id). */
export async function liffCustomer(ctx: RequestContext, tx: Executor) {
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const [cust] = (await tenantDb(ctx, tx).select(customer, eq(customer.id, ctx.actor.id))) as (typeof customer.$inferSelect)[];
  if (!cust) throw new AppError("NOT_FOUND");
  return cust;
}

/** The customer's own active pet known to this shop (has a pet_shop_profile in the org); anything else → NOT_FOUND (Q-1034). */
export async function requireMyPet(ctx: RequestContext, tx: Executor, petId: string) {
  const cust = await liffCustomer(ctx, tx);
  const [shop] = await tenantDb(ctx, tx).select(petShopProfile, eq(petShopProfile.petId, petId));
  // pet has no organization_id: reached only through the org-checked pet_shop_profile
  const [p] = shop ? await tx.select().from(pet).where(eq(pet.id, petId)) : [];
  if (!p || p.ownerProfileId !== cust.ownerProfileId || p.status !== "active") throw new AppError("NOT_FOUND");
  return p;
}

/** 05#dto-MyPet: the staff PetDetail minus the shop-only fields, plus the shop's photos. */
export async function myPet(ctx: RequestContext, tx: Executor, petId: string): Promise<MyPet> {
  const d = await petDetail(ctx, tx, petId);
  const photos = (await tenantDb(ctx, tx)
    .select(petPhoto, and(eq(petPhoto.petId, petId), inArray(petPhoto.kind, [...CUSTOMER_PHOTO_KINDS])))
    .orderBy(desc(petPhoto.takenAt), desc(petPhoto.id))) as (typeof petPhoto.$inferSelect)[];
  return {
    id: d.id,
    name: d.name,
    species: d.species,
    breed: d.breed,
    sex: d.sex,
    birthDate: d.birthDate,
    neutered: d.neutered,
    coatType: d.coatType,
    latestWeightGrams: d.latestWeightGrams,
    photoUrl: d.photoUrl,
    sharedNote: d.shop.sharedNote,
    vaccinations: d.vaccinations,
    photos: await Promise.all(
      photos.map(async (ph) => ({
        id: ph.id,
        kind: ph.kind,
        url: await signedUrl(tx, ctx, ph.fileId),
        caption: ph.caption,
        takenAt: ph.takenAt.toISOString(),
        appointmentId: ph.appointmentId,
        stayId: ph.stayId,
      })),
    ),
    nextGroomDue: d.nextGroomDue,
  };
}

export async function liffPets(ctx: RequestContext, _input: LiffPetsRequest): Promise<LiffPetsResponse> {
  const db = getDb();
  const cust = await liffCustomer(ctx, db);
  // pet has no organization_id: the owner comes from the org-checked customer, the shop link from tenantDb
  const owned = await db
    .select({ id: pet.id })
    .from(pet)
    .where(and(eq(pet.ownerProfileId, cust.ownerProfileId), eq(pet.status, "active")))
    .orderBy(asc(pet.createdAt), asc(pet.id));
  if (!owned.length) return [];
  const known = (await tenantDb(ctx, db).select(
    petShopProfile,
    inArray(
      petShopProfile.petId,
      owned.map((p) => p.id),
    ),
  )) as (typeof petShopProfile.$inferSelect)[];
  const knownIds = new Set(known.map((s) => s.petId));
  const out: MyPet[] = [];
  for (const p of owned) if (knownIds.has(p.id)) out.push(await myPet(ctx, db, p.id));
  return out;
}
