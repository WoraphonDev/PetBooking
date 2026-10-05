import type { BranchSetModulesRequest, BranchSetModulesResponse } from "@app/contracts/endpoints/branch.setModules";
import { branch, daycareVisit, groomAppointment, stay } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, gte, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRow, branchSettings } from "./get.ts";

type Module = "grooming" | "hotel" | "daycare";
const COLUMN = { grooming: "moduleGrooming", hotel: "moduleHotel", daycare: "moduleDaycare" } as const;

/** bookings of the branch with an unfinished future item of the module (Q-0115) */
async function futureBookings(tx: Tx, ctx: RequestContext, b: typeof branch.$inferSelect, module: Module): Promise<number> {
  const db = tenantDb(ctx, tx);
  const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: b.timezone });
  const rows = (
    module === "grooming"
      ? await db.select(
          groomAppointment,
          and(
            eq(groomAppointment.branchId, b.id),
            inArray(groomAppointment.status, ["scheduled", "checked_in", "in_progress"]),
            gt(groomAppointment.endsAt, ctx.now),
          ),
        )
      : module === "hotel"
        ? await db.select(
            stay,
            and(eq(stay.branchId, b.id), inArray(stay.status, ["reserved", "checked_in"]), gte(stay.checkOutDate, today)),
          )
        : await db.select(
            daycareVisit,
            and(
              eq(daycareVisit.branchId, b.id),
              inArray(daycareVisit.status, ["reserved", "checked_in"]),
              gte(daycareVisit.visitDate, today),
            ),
          )
  ) as { bookingId: string }[];
  return new Set(rows.map((r) => r.bookingId)).size;
}

/**
 * 05#ep-branch.setModules: sets the given module flags. Switching a module off with future bookings is allowed (LIFF hides
 * its menu, nothing is cancelled) and answers one MODULE_HAS_FUTURE_BOOKINGS warning per such module (Q-0115).
 */
export async function branchSetModules(ctx: RequestContext, input: BranchSetModulesRequest): Promise<BranchSetModulesResponse> {
  requireRole(ctx, "branch.setModules");
  return withTx(ctx, async (tx) => {
    const b = await branchRow(ctx, tx);
    const set: Partial<Record<(typeof COLUMN)[Module], boolean>> = {};
    const warnings: BranchSetModulesResponse["warnings"] = [];
    for (const module of ["grooming", "hotel", "daycare"] as const) {
      const value = input[module];
      if (value === undefined) continue;
      set[COLUMN[module]] = value;
      if (value || !b[COLUMN[module]]) continue;
      const bookingCount = await futureBookings(tx, ctx, b, module);
      if (bookingCount > 0)
        warnings.push({
          code: "MODULE_HAS_FUTURE_BOOKINGS",
          message: `ยังมีใบจองที่ค้างอยู่ ${bookingCount} ใบ`,
          data: { module, bookingCount },
        });
    }
    if (Object.keys(set).length) await tenantDb(ctx, tx).update(branch, { ...set, updatedAt: ctx.now }, eq(branch.id, b.id));
    return { ...(await branchSettings(ctx, tx)), warnings };
  });
}
