import type { DaycareSessionTypeItem } from "@app/contracts/dto/daycare-session-type-item";
import type { DaycareTypesListRequest, DaycareTypesListResponse } from "@app/contracts/endpoints/daycareTypes.list";
import { daycareSessionValues } from "@app/contracts/enums";
import { branch, daycareRate, daycareSessionType, ratePlan } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** the branch's default rate plan — MVP prices live on that single plan (02#tbl-rate_plan) */
export async function defaultRatePlan(ctx: RequestContext, tx: Executor, branchId: string) {
  const [plan] = (await tenantDb(ctx, tx).select(
    ratePlan,
    and(eq(ratePlan.branchId, branchId), eq(ratePlan.isDefault, true)),
  )) as (typeof ratePlan.$inferSelect)[];
  return plan ?? null;
}

/** All daycare sessions of the branch (full_day, morning, afternoon order) with the default plan's prices. */
export async function branchDaycareTypes(ctx: RequestContext, tx: Executor, branchId: string): Promise<DaycareSessionTypeItem[]> {
  const db = tenantDb(ctx, tx);
  const types = (await db.select(
    daycareSessionType,
    eq(daycareSessionType.branchId, branchId),
  )) as (typeof daycareSessionType.$inferSelect)[];
  const plan = types.length ? await defaultRatePlan(ctx, tx, branchId) : null;
  const rates =
    plan && types.length
      ? ((await db.select(
          daycareRate,
          and(
            eq(daycareRate.ratePlanId, plan.id),
            inArray(
              daycareRate.sessionTypeId,
              types.map((t) => t.id),
            ),
          ),
        )) as (typeof daycareRate.$inferSelect)[])
      : [];
  const order = (s: string) => daycareSessionValues.indexOf(s as (typeof daycareSessionValues)[number]);
  return [...types]
    .sort((a, b) => order(a.session) - order(b.session))
    .map((t) => ({
      id: t.id,
      session: t.session,
      nameTh: t.nameTh,
      // Postgres time → HH:MM
      startsAt: t.startsAt.slice(0, 5),
      endsAt: t.endsAt.slice(0, 5),
      capacity: t.capacity,
      status: t.status,
      rates: rates
        .filter((r) => r.sessionTypeId === t.id)
        .sort(
          (a, b) =>
            Number(a.sizeTierId !== null) - Number(b.sizeTierId !== null) ||
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .map((r) => ({ sizeTierId: r.sizeTierId, priceSatang: r.priceSatang })),
    }));
}

export async function daycareTypesList(ctx: RequestContext, _input: DaycareTypesListRequest): Promise<DaycareTypesListResponse> {
  requireRole(ctx, "daycareTypes.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [scopedBranch] = await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId));
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  return branchDaycareTypes(ctx, db, ctx.branchId);
}
