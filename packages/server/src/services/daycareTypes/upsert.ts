import type { DaycareTypesUpsertRequest, DaycareTypesUpsertResponse } from "@app/contracts/endpoints/daycareTypes.upsert";
import { branch, daycareRate, daycareSessionType, sizeTier } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchDaycareTypes, defaultRatePlan } from "./list.ts";

/**
 * Creates (no id) or updates (id) the given sessions; sessions not sent are left as they are (archive via status).
 * `rates` sent → replaces that session's prices on the branch's default rate plan; omitted → prices unchanged.
 */
export async function daycareTypesUpsert(ctx: RequestContext, input: DaycareTypesUpsertRequest): Promise<DaycareTypesUpsertResponse> {
  requireRole(ctx, "daycareTypes.upsert");
  const branchId = ctx.branchId;
  if (!branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = await db.select(branch, eq(branch.id, branchId));
    if (!scopedBranch) throw new AppError("NOT_FOUND");

    const existing = (await db.select(
      daycareSessionType,
      eq(daycareSessionType.branchId, branchId),
    )) as (typeof daycareSessionType.$inferSelect)[];
    const ids = input.items.flatMap((i) => (i.id ? [i.id] : []));
    if (ids.some((id) => !existing.some((e) => e.id === id))) throw new AppError("NOT_FOUND");
    const tierIds = [...new Set(input.items.flatMap((i) => i.rates?.flatMap((r) => (r.sizeTierId ? [r.sizeTierId] : [])) ?? []))];
    if (tierIds.length) {
      const tiers = await db.select(sizeTier, and(eq(sizeTier.branchId, branchId), inArray(sizeTier.id, tierIds)));
      if (tiers.length !== tierIds.length) throw new AppError("NOT_FOUND");
    }

    // 05 validation "ไม่ซ้ำ": one row per session in the branch after the change
    const fields: Record<string, string> = {};
    input.items.forEach((item, i) => {
      const clash = existing.find((e) => e.session === item.session && e.id !== item.id && !input.items.some((o) => o.id === e.id));
      if (clash) fields[`items.${i}.session`] = "session already exists";
    });
    if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

    const needsPlan = input.items.some((i) => i.rates?.length);
    const plan = needsPlan ? await defaultRatePlan(ctx, tx, branchId) : null;
    // every branch gets its default plan in admin.createOrg; missing means broken setup, not a client error
    if (needsPlan && !plan) throw new Error("daycareTypes.upsert: branch has no default rate_plan");

    // apply rows in an order where each target session is already free (unique (branch_id, session));
    // a pure swap between existing rows has no such order and is rejected
    const held = new Map(existing.map((e) => [e.session as string, e.id]));
    const pending = [...input.items];
    const ordered: typeof input.items = [];
    while (pending.length) {
      const next = pending.findIndex((i) => {
        const holder = held.get(i.session);
        return holder === undefined || holder === i.id;
      });
      if (next < 0) {
        const stuck = input.items.indexOf(pending[0] as (typeof input.items)[number]);
        throw new AppError("VALIDATION_FAILED", { fields: { [`items.${stuck}.session`]: "sessions cannot be swapped in one request" } });
      }
      const [item] = pending.splice(next, 1) as [(typeof input.items)[number]];
      const before = existing.find((e) => e.id === item.id)?.session;
      if (before && held.get(before) === item.id) held.delete(before);
      held.set(item.session, item.id ?? `new:${ordered.length}`);
      ordered.push(item);
    }

    for (const item of ordered) {
      const values = {
        session: item.session,
        nameTh: item.nameTh,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        capacity: item.capacity,
        status: item.status,
        updatedAt: ctx.now,
      };
      const [row] = item.id
        ? await db.update(daycareSessionType, values, eq(daycareSessionType.id, item.id))
        : await db.insert(daycareSessionType, { ...values, branchId, createdAt: ctx.now });
      if (!row) throw new AppError("NOT_FOUND");
      if (!item.rates) continue;
      await tx.delete(daycareRate).where(and(eq(daycareRate.organizationId, ctx.orgId ?? ""), eq(daycareRate.sessionTypeId, row.id)));
      if (item.rates.length && plan)
        await db.insert(
          daycareRate,
          item.rates.map((r) => ({
            sessionTypeId: row.id,
            ratePlanId: plan.id,
            sizeTierId: r.sizeTierId ?? null,
            priceSatang: r.priceSatang,
            createdAt: ctx.now,
            updatedAt: ctx.now,
          })),
        );
    }
    return branchDaycareTypes(ctx, tx, branchId);
  });
}
