import type { SizeTiersSetRequest, SizeTiersSetResponse } from "@app/contracts/endpoints/sizeTiers.set";
import { branch, groomAppointment, packageTemplate, sizeTier } from "@app/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { sizeTierItem } from "./list.ts";

type TierInput = SizeTiersSetRequest["tiers"][number];

/**
 * Rows (indexes into tiers[]) that break "continuous, no overlap, no gap, starting at 0" (05#ep-sizeTiers.set, R-01):
 * the first row by min not starting at 0, a row not starting at the previous row's max, a last row with a ceiling (Q-0029).
 */
export function discontinuousRows(tiers: readonly TierInput[]): number[] {
  const order = tiers.map((t, i) => ({ t, i })).sort((a, b) => a.t.minWeightGrams - b.t.minWeightGrams || a.i - b.i);
  const rows = new Set<number>();
  order.forEach(({ t, i }, k) => {
    const prev = order[k - 1];
    if (!prev && t.minWeightGrams !== 0) rows.add(i);
    if (prev && prev.t.maxWeightGrams !== t.minWeightGrams) rows.add(i);
    if (k === order.length - 1 && t.maxWeightGrams != null) rows.add(i);
  });
  return [...rows].sort((a, b) => a - b);
}

/** Replaces the whole tier set of one species for the session branch. */
export async function sizeTiersSet(ctx: RequestContext, input: SizeTiersSetRequest): Promise<SizeTiersSetResponse> {
  requireRole(ctx, "sizeTiers.set");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId ?? ""))) as (typeof branch.$inferSelect)[];
    if (!scopedBranch) throw new AppError("NOT_FOUND");

    const rows = discontinuousRows(input.tiers);
    if (rows.length > 0) throw new AppError("SIZE_TIER_OVERLAP", { rows });

    const forSpecies = and(eq(sizeTier.branchId, scopedBranch.id), eq(sizeTier.species, input.species));
    const existing = (await db.select(sizeTier, forSpecies)) as (typeof sizeTier.$inferSelect)[];
    const existingIds = new Set(existing.map((t) => t.id));
    if (input.tiers.some((t) => t.id && !existingIds.has(t.id))) throw new AppError("NOT_FOUND");

    const keptIds = new Set(input.tiers.flatMap((t) => (t.id ? [t.id] : [])));
    const removed = existing.filter((t) => !keptIds.has(t.id)).map((t) => t.id);
    if (removed.length > 0) {
      // Q-0029: a tier referenced by an appointment or a package cannot be removed; its prices/rates cascade with it.
      const [appt] = await db.select(groomAppointment, inArray(groomAppointment.sizeTierId, removed)).limit(1);
      const [pkg] = await db.select(packageTemplate, inArray(packageTemplate.sizeTierId, removed)).limit(1);
      if (appt || pkg) throw new AppError("IN_USE");
      await tx
        .delete(sizeTier)
        .where(and(eq(sizeTier.organizationId, scopedBranch.organizationId), forSpecies, inArray(sizeTier.id, removed)));
    }

    // sort_order follows the weight order; kept rows first get a temporary code so swapped codes don't hit the unique index
    const ordered = [...input.tiers].sort((a, b) => a.minWeightGrams - b.minWeightGrams);
    const kept = ordered.filter((t) => t.id);
    for (const t of kept) await db.update(sizeTier, { code: `~${t.id}` }, eq(sizeTier.id, t.id ?? ""));
    for (const [sortOrder, t] of ordered.entries()) {
      const values = {
        code: t.code,
        labelTh: t.labelTh,
        minWeightGrams: t.minWeightGrams,
        maxWeightGrams: t.maxWeightGrams ?? null,
        sortOrder,
        updatedAt: ctx.now,
      };
      if (t.id) await db.update(sizeTier, values, and(forSpecies, eq(sizeTier.id, t.id)));
      else await db.insert(sizeTier, { ...values, branchId: scopedBranch.id, species: input.species, createdAt: ctx.now });
    }

    const saved = (await db.select(sizeTier, forSpecies).orderBy(asc(sizeTier.sortOrder))) as (typeof sizeTier.$inferSelect)[];
    return saved.map(sizeTierItem);
  });
}
