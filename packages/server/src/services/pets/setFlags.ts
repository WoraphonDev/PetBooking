import type { PetsSetFlagsRequest, PetsSetFlagsResponse } from "@app/contracts/endpoints/pets.setFlags";
import { petTemperamentFlag } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail, requirePet } from "./get.ts";

/** 05#ep-pets.setFlags: replaces this shop's whole set of temperament flags for the pet (other shops keep theirs) */
export async function petsSetFlags(ctx: RequestContext, input: PetsSetFlagsRequest & { petId: string }): Promise<PetsSetFlagsResponse> {
  requireRole(ctx, "pets.setFlags");
  return withTx(ctx, async (tx) => {
    const { p } = await requirePet(ctx, tx, input.petId);
    // tenantDb has no delete: filter by the tenant key explicitly
    await tx
      .delete(petTemperamentFlag)
      .where(and(eq(petTemperamentFlag.organizationId, ctx.orgId ?? ""), eq(petTemperamentFlag.petId, p.id)));
    for (const f of input.flags)
      await tenantDb(ctx, tx).insert(petTemperamentFlag, {
        petId: p.id,
        flag: f.flag,
        note: f.note || null,
        createdBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
        createdAt: ctx.now,
      });
    return petDetail(ctx, tx, p.id);
  });
}
