import type { DaycareVisitItem } from "@app/contracts/dto/daycare-visit-item";
import type { DaycareListRequest, DaycareListResponse } from "@app/contracts/endpoints/daycare.list";
import { daycareSessionType, daycareVisit } from "@app/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";

/** DaycareVisitItem of one org-checked visit (from bookingDetail, so it matches bookings.get) */
export async function daycareVisitItem(ctx: RequestContext, db: Executor, visitId: string, bookingId: string): Promise<DaycareVisitItem> {
  const item = (await bookingDetail(ctx, db, bookingId)).daycare.find((d) => d.id === visitId);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}

/** 05#ep-daycare.list: the session branch's visits on `date` (cancelled left out), by session start then pet name */
export async function daycareList(ctx: RequestContext, input: DaycareListRequest): Promise<DaycareListResponse> {
  requireRole(ctx, "daycare.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const repo = tenantDb(ctx, db);
  const visits = (await repo.select(
    daycareVisit,
    and(eq(daycareVisit.branchId, ctx.branchId), eq(daycareVisit.visitDate, input.date), ne(daycareVisit.status, "cancelled")),
  )) as (typeof daycareVisit.$inferSelect)[];
  const sessions = (await repo.select(
    daycareSessionType,
    eq(daycareSessionType.branchId, ctx.branchId),
  )) as (typeof daycareSessionType.$inferSelect)[];
  const startOf = new Map(sessions.map((s) => [s.id, s.startsAt]));
  const items = new Map<string, DaycareVisitItem>();
  for (const bookingId of new Set(visits.map((v) => v.bookingId)))
    for (const item of (await bookingDetail(ctx, db, bookingId)).daycare) items.set(item.id, item);
  return visits
    .flatMap((v) => {
      const item = items.get(v.id);
      return item ? [{ item, start: startOf.get(v.sessionTypeId) ?? "" }] : [];
    })
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.item.pet.name.localeCompare(b.item.pet.name, "th") || a.item.id.localeCompare(b.item.id),
    )
    .map((x) => x.item);
}
