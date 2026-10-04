import type { GroomPickUpRequest, GroomPickUpResponse } from "@app/contracts/endpoints/groom.pickUp";
import { branch, branchPolicy, groomAppointment, pet, petShopProfile } from "@app/db/schema";
import { nextGroomDue } from "@app/domain/aftercare/next-groom";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, inArray, notInArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { scheduleJob } from "../../jobs/schedule.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;

/**
 * 05#ep-groom.pickUp: done → picked_up, picked_up_at = now, pet_shop_profile.last_groomed_at = done_at, and the R-17
 * next_groom_reminder job (remindOn 10:00 local). Bills stay open; the dashboard lists them in todo.pickupsWithoutBill.
 */
export async function groomPickUp(ctx: RequestContext, input: GroomPickUpRequest): Promise<GroomPickUpResponse> {
  requireRole(ctx, "groom.pickUp");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    const updated = (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "picked_up",
      extraSet: { pickedUpAt: ctx.now },
    })) as Appt;
    const [br] = (await db.select(branch, eq(branch.id, a.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");

    const [profile] = (await db.select(petShopProfile, eq(petShopProfile.petId, a.petId))) as (typeof petShopProfile.$inferSelect)[];
    const lastGroomedAt = updated.doneAt ?? ctx.now;
    if (profile) await db.update(petShopProfile, { lastGroomedAt, updatedAt: ctx.now }, eq(petShopProfile.id, profile.id));
    else await db.insert(petShopProfile, { petId: a.petId, lastGroomedAt, createdAt: ctx.now });

    // R-17 from this shop's done/picked-up visits of the pet
    const visits = (await db.select(
      groomAppointment,
      and(eq(groomAppointment.petId, a.petId), inArray(groomAppointment.status, ["done", "picked_up"])),
    )) as Appt[];
    const future = await db.select(
      groomAppointment,
      and(
        eq(groomAppointment.petId, a.petId),
        gt(groomAppointment.startsAt, ctx.now),
        notInArray(groomAppointment.status, ["cancelled", "no_show"]),
      ),
    );
    // pet has no organization_id: reached through the org-checked appointment
    const [p] = await tx.select({ status: pet.status }).from(pet).where(eq(pet.id, a.petId));
    // branch_policy is keyed by the org-checked branch; a missing row means the column default
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
    const due = nextGroomDue({
      visitDates: visits.map((v) => toLocalDate({ instant: v.startsAt.toISOString(), timezone: br.timezone })).sort(),
      shopIntervalDays: profile?.groomIntervalDays ?? null,
      defaultDays: policy?.nextGroomDefaultDays ?? 28,
      hasFutureAppointment: future.length > 0,
      petStatus: p?.status ?? "active",
    });
    if (due.dueDate && due.remindOn)
      await scheduleJob(tx, {
        type: "next_groom_reminder",
        runAt: new Date(localToUtc({ date: due.remindOn, time: "10:00", timezone: br.timezone })),
        payload: { petId: a.petId, organizationId: br.organizationId },
        dedupeKey: `next_groom:${a.petId}:${due.dueDate}`,
        orgId: br.organizationId,
      });
    return updated;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
