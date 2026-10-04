import type { GroomMyQueueRequest, GroomMyQueueResponse } from "@app/contracts/endpoints/groom.myQueue";
import { groomAppointment } from "@app/db/schema";
import { localDayBounds, toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { appointmentCards } from "../bookings/get.ts";

/** 05#ep-groom.myQueue: the signed-in groomer's appointments that start on one branch-local day, by starts_at. */
export async function groomMyQueue(ctx: RequestContext, input: GroomMyQueueRequest): Promise<GroomMyQueueResponse> {
  requireRole(ctx, "groom.myQueue");
  const db = getDb();
  if (!ctx.actor.id) return [];
  const date = input.date ?? toLocalDate({ instant: ctx.now.toISOString(), timezone: ctx.timezone });
  const day = localDayBounds({ date, timezone: ctx.timezone });
  const rows = (await tenantDb(ctx, db)
    .select(
      groomAppointment,
      and(
        eq(groomAppointment.groomerId, ctx.actor.id),
        gte(groomAppointment.startsAt, new Date(day.start)),
        lt(groomAppointment.startsAt, new Date(day.end)),
      ),
    )
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
  return appointmentCards(ctx, db, rows);
}
