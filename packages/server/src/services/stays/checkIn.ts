import type { StaysCheckInRequest, StaysCheckInResponse } from "@app/contracts/endpoints/stays.checkIn";
import {
  booking,
  branch,
  branchPolicy,
  careTask,
  consentDocument,
  pet,
  petVaccination,
  roomUnit,
  stay,
  stayIntake,
  stayMedication,
} from "@app/db/schema";
import { generateCareTasks } from "@app/domain/care/care-tasks";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { stayDetail } from "./get.ts";

const hhmm = (t: string) => t.slice(0, 5);

/**
 * 05#ep-stays.checkIn: reserved → checked_in (checked_in_at = now, weight_grams_in) from the branch-local check_in_date on
 * (earlier → STATUS_NOT_ALLOWED). Needs a completed intake (INTAKE_INCOMPLETE) and a boarding agreement (CONSENT_REQUIRED).
 * R-11 against check_out_date: failing needs vaccineOverrideReason (VACCINE_REQUIRED) → stay.vaccine_override_reason + audit
 * stay.vaccine_override. R-26 care tasks from the intake; customer.stay_checked_in {petName, roomCode, updatesUrl = L-10}.
 */
export async function staysCheckIn(ctx: RequestContext, input: StaysCheckInRequest & { stayId: string }): Promise<StaysCheckInResponse> {
  requireRole(ctx, "stays.checkIn");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId)).for("update")) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId))) as (typeof booking.$inferSelect)[];
    if (!br || !bk) throw new AppError("NOT_FOUND");
    if (s.status === "reserved" && toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone }) < s.checkInDate)
      throw new AppError("STATUS_NOT_ALLOWED", { allowedFrom: s.checkInDate });
    if (s.status !== "reserved") throw new AppError("INVALID_TRANSITION");

    const [intake] = (await db.select(stayIntake, eq(stayIntake.stayId, s.id))) as (typeof stayIntake.$inferSelect)[];
    if (!intake?.completedAt) throw new AppError("INTAKE_INCOMPLETE");
    const [agreement] = await db.select(
      consentDocument,
      and(eq(consentDocument.stayId, s.id), eq(consentDocument.kind, "boarding_agreement")),
    );
    if (!agreement) throw new AppError("CONSENT_REQUIRED");

    // pet / branch_policy / pet_vaccination have no organization_id: reached through the org-checked stay
    const [p] = await tx.select({ name: pet.name, species: pet.species }).from(pet).where(eq(pet.id, s.petId));
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
    const required =
      p?.species === "dog" ? (policy?.requiredVaccinesDog ?? []) : p?.species === "cat" ? (policy?.requiredVaccinesCat ?? []) : [];
    const vaccinations = await tx.select().from(petVaccination).where(eq(petVaccination.petId, s.petId));
    const gate = checkVaccines({
      requiredCodes: required,
      vaccinations: vaccinations.map((v) => ({ code: v.vaccineCode, expiresOn: v.expiresOn, status: v.status })),
      mustBeValidOn: s.checkOutDate,
    });
    const override = input.vaccineOverrideReason?.trim() || null;
    if (!gate.ok && !override)
      throw new AppError("VACCINE_REQUIRED", { missing: gate.missing, expired: gate.expired, pendingReview: gate.pendingReview });

    await transition(tx, ctx, {
      table: stay,
      id: s.id,
      machine: "stay",
      to: "checked_in",
      extraSet: {
        checkedInAt: ctx.now,
        weightGramsIn: input.weightGrams ?? null,
        vaccineOverrideReason: gate.ok ? null : override,
        updatedAt: ctx.now,
      },
    });
    if (!gate.ok)
      await writeAudit(tx, ctx, {
        action: "stay.vaccine_override",
        entityType: "stay",
        entityId: s.id,
        reason: override,
        after: { missing: gate.missing, expired: gate.expired, pendingReview: gate.pendingReview },
      });

    // R-26 from the completed intake
    const meds = (await db.select(stayMedication, eq(stayMedication.stayId, s.id))) as (typeof stayMedication.$inferSelect)[];
    const plan = generateCareTasks({
      checkedInAt: ctx.now.toISOString(),
      checkOutDate: s.checkOutDate,
      expectedCheckOutTime: s.expectedCheckOutTime ? hhmm(s.expectedCheckOutTime) : null,
      timezone: br.timezone,
      feedingTimes: intake.feedingTimes.map(hhmm),
      medications: meds.map((m) => ({ id: m.id, name: m.name, times: m.times.map(hhmm) })),
      walksPerDay: intake.walksPerDay,
    });
    for (const t of plan)
      await db.insert(careTask, {
        branchId: s.branchId,
        stayId: s.id,
        taskType: t.taskType,
        title: t.title,
        dueAt: new Date(t.dueAt),
        medicationId: t.medicationId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });

    const [unit] = s.roomUnitId ? ((await db.select(roomUnit, eq(roomUnit.id, s.roomUnitId))) as (typeof roomUnit.$inferSelect)[]) : [];
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      {
        key: "customer.stay_checked_in",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          petName: p?.name ?? "",
          roomCode: unit?.code ?? "",
          updatesUrl: new URL(`/liff/${br.bookingSlug}/stays/${s.id}`, process.env.APP_BASE_URL).toString(),
        },
        dedupeKey: `stay_checked_in:${s.id}`,
      },
    );
  });
  return stayDetail(ctx, getDb(), input.stayId);
}
