import type { StaysChangeDatesRequest, StaysChangeDatesResponse } from "@app/contracts/endpoints/stays.changeDates";
import { booking, branch, careTask, service, stay, stayAddon, stayIntake, stayMedication } from "@app/db/schema";
import { generateCareTasks } from "@app/domain/care/care-tasks";
import { quoteBooking } from "@app/domain/pricing/quote";
import { and, eq, gt, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError, mapPgError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";

type Task = { taskType: string; title: string; dueAt: Date; medicationId: string | null };
const keyOf = (t: Task) => `${t.taskType}|${t.title}|${t.dueAt.toISOString()}|${t.medicationId ?? ""}`;

/**
 * 05#ep-stays.changeDates: new check-out (and check-in while reserved) of a reserved / checked_in stay (others →
 * STATUS_NOT_ALLOWED). R-03 at the booked nightly price → nights / room_total, per-day add-ons → quantity = nights, and the
 * booking estimate moves by the difference. The room / pet exclusion constraints answer ROOM_TAKEN / PET_ALREADY_BOOKED
 * (R-28: no moving rooms). A checked-in stay gets the R-26 task difference: future pending tasks the new range no longer
 * has are deleted, missing ones are added.
 */
export async function staysChangeDates(
  ctx: RequestContext,
  input: StaysChangeDatesRequest & { stayId: string },
): Promise<StaysChangeDatesResponse> {
  requireRole(ctx, "stays.changeDates");
  let bookingId: string;
  try {
    bookingId = await withTx(ctx, async (tx) => {
      const db = tenantDb(ctx, tx);
      const [s] = (await db.select(stay, eq(stay.id, input.stayId)).for("update")) as (typeof stay.$inferSelect)[];
      if (!s) throw new AppError("NOT_FOUND");
      if (s.status !== "reserved" && s.status !== "checked_in") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
      if (input.checkInDate !== undefined && input.checkInDate !== s.checkInDate && s.status !== "reserved")
        throw new AppError("VALIDATION_FAILED", { fields: { checkInDate: "only while reserved" } });
      const checkInDate = input.checkInDate ?? s.checkInDate;
      if (input.checkOutDate <= checkInDate)
        throw new AppError("VALIDATION_FAILED", { fields: { checkOutDate: "must be after checkInDate" } });

      const addons = (await db.select(stayAddon, eq(stayAddon.stayId, s.id))) as (typeof stayAddon.$inferSelect)[];
      const services = addons.length
        ? ((await db.select(
            service,
            inArray(
              service.id,
              addons.map((a) => a.serviceId),
            ),
          )) as (typeof service.$inferSelect)[])
        : [];
      const perDay = (a: typeof stayAddon.$inferSelect) => services.find((x) => x.id === a.serviceId)?.addonPerDay ?? false;
      const quote = quoteBooking({
        bufferMinutes: 0,
        stays: [
          {
            checkInDate,
            checkOutDate: input.checkOutDate,
            nightlyPriceSatang: s.nightlyPriceSatang,
            addons: addons.map((a) => ({ unitPriceSatang: a.unitPriceSatang, perDay: perDay(a), quantity: a.quantity })),
          },
        ],
      });
      if ("error" in quote) throw new AppError("VALIDATION_FAILED", { fields: { checkOutDate: quote.error } });
      const [q] = quote.stays;
      if (!q) throw new Error("quote without the stay");

      await db.update(
        stay,
        { checkInDate, checkOutDate: input.checkOutDate, nights: q.nights, roomTotalSatang: q.roomTotalSatang, updatedAt: ctx.now },
        eq(stay.id, s.id),
      );
      let delta = q.roomTotalSatang - s.roomTotalSatang;
      for (const [i, a] of addons.entries()) {
        const next = q.addons[i];
        if (!next || !perDay(a) || next.quantity === a.quantity) continue;
        delta += next.totalSatang - a.totalSatang;
        await db.update(stayAddon, { quantity: next.quantity, totalSatang: next.totalSatang }, eq(stayAddon.id, a.id));
      }
      const [bk] = (await db.select(booking, eq(booking.id, s.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
      if (!bk) throw new AppError("NOT_FOUND");
      if (delta !== 0)
        await db.update(
          booking,
          { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang + delta), updatedAt: ctx.now },
          eq(booking.id, bk.id),
        );

      if (s.status === "checked_in" && s.checkedInAt) await syncCareTasks(ctx, tx, s, input.checkOutDate);
      return bk.id;
    });
  } catch (e) {
    throw e instanceof AppError ? e : mapPgError(e);
  }
  const card = (await bookingDetail(ctx, getDb(), bookingId)).stays.find((x) => x.id === input.stayId);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}

/** R-26 for the new check-out: drop future pending tasks outside the new plan, add the plan's tasks not there yet */
async function syncCareTasks(ctx: RequestContext, tx: Tx, s: typeof stay.$inferSelect, checkOutDate: string) {
  const db = tenantDb(ctx, tx);
  const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
  const [intake] = (await db.select(stayIntake, eq(stayIntake.stayId, s.id))) as (typeof stayIntake.$inferSelect)[];
  const meds = (await db.select(stayMedication, eq(stayMedication.stayId, s.id))) as (typeof stayMedication.$inferSelect)[];
  const hhmm = (t: string) => t.slice(0, 5);
  const plan: Task[] = generateCareTasks({
    checkedInAt: (s.checkedInAt ?? ctx.now).toISOString(),
    checkOutDate,
    expectedCheckOutTime: s.expectedCheckOutTime ? hhmm(s.expectedCheckOutTime) : null,
    timezone: br?.timezone ?? ctx.timezone,
    feedingTimes: (intake?.feedingTimes ?? []).map(hhmm),
    medications: meds.map((m) => ({ id: m.id, name: m.name, times: m.times.map(hhmm) })),
    walksPerDay: intake?.walksPerDay ?? 0,
  }).map((t) => ({ ...t, dueAt: new Date(t.dueAt) }));
  const wanted = new Set(plan.map(keyOf));
  const existing = (await db.select(careTask, eq(careTask.stayId, s.id))) as (typeof careTask.$inferSelect)[];
  const stale = existing.filter((t) => t.status === "pending" && t.dueAt > ctx.now && !wanted.has(keyOf(t))).map((t) => t.id);
  // tenantDb has no delete: filter by the tenant key explicitly
  if (stale.length)
    await tx
      .delete(careTask)
      .where(and(eq(careTask.organizationId, ctx.orgId ?? ""), inArray(careTask.id, stale), gt(careTask.dueAt, ctx.now)));
  const have = new Set(existing.map(keyOf));
  const missing = plan.filter((t) => t.dueAt > ctx.now && !have.has(keyOf(t)));
  for (const t of missing)
    await db.insert(careTask, {
      branchId: s.branchId,
      stayId: s.id,
      taskType: t.taskType as typeof careTask.$inferInsert.taskType,
      title: t.title,
      dueAt: t.dueAt,
      medicationId: t.medicationId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
}
