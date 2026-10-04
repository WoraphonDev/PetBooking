import type { DaycareCheckInRequest, DaycareCheckInResponse } from "@app/contracts/endpoints/daycare.check_in";
import { branch, branchPolicy, daycareVisit, pet, petVaccination } from "@app/db/schema";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { daycareVisitItem } from "./list.ts";

/**
 * 05#ep-daycare.check_in: reserved → checked_in (checked_in_at) only on visit_date in the branch timezone (03 guard; other
 * days → STATUS_NOT_ALLOWED) and when R-11 passes for visit_date (else VACCINE_REQUIRED {missing, expired, pendingReview};
 * daycare has no override).
 */
export async function daycareCheckIn(ctx: RequestContext, input: DaycareCheckInRequest): Promise<DaycareCheckInResponse> {
  requireRole(ctx, "daycare.check_in");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [v] = (await db.select(daycareVisit, eq(daycareVisit.id, input.visitId)).for("update")) as (typeof daycareVisit.$inferSelect)[];
    if (!v) throw new AppError("NOT_FOUND");
    const [br] = (await db.select(branch, eq(branch.id, v.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    if (v.status === "reserved") {
      const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone });
      if (today !== v.visitDate) throw new AppError("STATUS_NOT_ALLOWED", { visitDate: v.visitDate });
      // pet / branch_policy / pet_vaccination have no organization_id: reached through the org-checked visit
      const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
      const [p] = await tx.select({ species: pet.species }).from(pet).where(eq(pet.id, v.petId));
      const required =
        p?.species === "dog" ? (policy?.requiredVaccinesDog ?? []) : p?.species === "cat" ? (policy?.requiredVaccinesCat ?? []) : [];
      const vaccinations = await tx.select().from(petVaccination).where(eq(petVaccination.petId, v.petId));
      const gate = checkVaccines({
        requiredCodes: required,
        vaccinations: vaccinations.map((x) => ({ code: x.vaccineCode, expiresOn: x.expiresOn, status: x.status })),
        mustBeValidOn: v.visitDate,
      });
      if (!gate.ok)
        throw new AppError("VACCINE_REQUIRED", { missing: gate.missing, expired: gate.expired, pendingReview: gate.pendingReview });
    }
    await transition(tx, ctx, {
      table: daycareVisit,
      id: v.id,
      machine: "daycare_visit",
      to: "checked_in",
      extraSet: { checkedInAt: ctx.now },
    });
    return v.bookingId;
  });
  return daycareVisitItem(ctx, getDb(), input.visitId, bookingId);
}
