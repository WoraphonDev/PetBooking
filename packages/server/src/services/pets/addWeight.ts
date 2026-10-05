import type { PetsAddWeightRequest, PetsAddWeightResponse } from "@app/contracts/endpoints/pets.addWeight";
import { pet, petWeight } from "@app/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail, requirePet } from "./get.ts";

/** 05#ep-pets.addWeight: a shop weight record (default now); pet.latest_weight_grams follows when it is the newest one */
export async function petsAddWeight(ctx: RequestContext, input: PetsAddWeightRequest & { petId: string }): Promise<PetsAddWeightResponse> {
  requireRole(ctx, "pets.addWeight");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const { p } = await requirePet(ctx, tx, input.petId);
    const measuredAt = input.measuredAt ? new Date(input.measuredAt) : ctx.now;
    await db.insert(petWeight, {
      petId: p.id,
      weightGrams: input.weightGrams,
      measuredAt,
      source: "shop",
      recordedBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
      createdAt: ctx.now,
    });
    const newer = await db.select(petWeight, and(eq(petWeight.petId, p.id), gt(petWeight.measuredAt, measuredAt)));
    // pet has no organization_id: requirePet checked this shop's profile of it
    if (newer.length === 0) await tx.update(pet).set({ latestWeightGrams: input.weightGrams, updatedAt: ctx.now }).where(eq(pet.id, p.id));
    return petDetail(ctx, tx, p.id);
  });
}
