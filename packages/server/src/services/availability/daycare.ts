import type { AvailabilityDaycareRequest, AvailabilityDaycareResponse } from "@app/contracts/endpoints/availability.daycare";
import { daycareRate, daycareSessionType, daycareVisit } from "@app/db/schema";
import { daycareAvailability } from "@app/domain/availability/daycare-availability";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { closedDates, defaultPlanId, pickPrice, scopedBranch, shopPet } from "./hotel.ts";

const ORDER = ["full_day", "morning", "afternoon"] as const;

export async function availabilityDaycare(ctx: RequestContext, input: AvailabilityDaycareRequest): Promise<AvailabilityDaycareResponse> {
  requireRole(ctx, "availability.daycare");
  const db = getDb();
  const b = await scopedBranch(ctx, db);
  const tdb = tenantDb(ctx, db);
  const subject = input.petId ? await shopPet(ctx, db, b.id, input.petId) : null;

  const types = (await tdb.select(daycareSessionType, eq(daycareSessionType.branchId, b.id))) as (typeof daycareSessionType.$inferSelect)[];
  const visits = (await tdb.select(
    daycareVisit,
    and(eq(daycareVisit.branchId, b.id), eq(daycareVisit.visitDate, input.date)),
  )) as (typeof daycareVisit.$inferSelect)[];
  const closed = (await closedDates(db, b, [input.date], ["all", "daycare"])).length > 0;
  const sessionOf = new Map(types.map((t) => [t.id, t.session]));
  const free = daycareAvailability({
    sessionTypes: types,
    visits: visits.flatMap((v) => {
      const session = sessionOf.get(v.sessionTypeId);
      return session ? [{ session, status: v.status }] : [];
    }),
    closed,
  });
  const active = types.filter((t) => t.status === "active").sort((a, b2) => ORDER.indexOf(a.session) - ORDER.indexOf(b2.session));
  const planId = await defaultPlanId(ctx, db, b.id);
  const rates =
    planId && active.length
      ? ((await tdb.select(
          daycareRate,
          and(
            eq(daycareRate.ratePlanId, planId),
            inArray(
              daycareRate.sessionTypeId,
              active.map((t) => t.id),
            ),
          ),
        )) as (typeof daycareRate.$inferSelect)[])
      : [];

  return {
    date: input.date,
    sessions: active.map((t) => ({
      sessionTypeId: t.id,
      session: t.session,
      nameTh: t.nameTh,
      available: free[t.session] ?? 0,
      priceSatang:
        pickPrice(
          rates.filter((r) => r.sessionTypeId === t.id),
          subject?.tierId ?? null,
        )?.priceSatang ?? null,
    })),
  };
}
