import type { LiffCreateBookingRequest, LiffCreateBookingResponse } from "@app/contracts/endpoints/liff.createBooking";
import {
  booking,
  branch,
  branchPolicy,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  ownerProfile,
  petVaccination,
  service,
  servicePrice,
  staffUser,
} from "@app/db/schema";
import { computeBookingDeadlines } from "@app/domain/booking/deadlines";
import { ageInMonths, checkEligibility } from "@app/domain/booking/eligibility";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { nextBookingNo } from "@app/domain/ids/booking-no";
import { computeDeposit } from "@app/domain/payment/deposit";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { quoteBooking } from "@app/domain/pricing/quote";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { writeBookingEvent } from "../../events.ts";
import { scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId, scopedBranch, shopPet } from "../availability/hotel.ts";
import { liffBooking } from "./booking.ts";
import { liffGroomSlots } from "./groomSlots.ts";
import { liffCustomer } from "./pets.ts";

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
/** statuses the groom exclusion constraints ignore */
const RELEASED = ["cancelled", "no_show"] as const;
const overlaps = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.e && b.s < a.e;

type Line = { serviceId: string; name: string; isAddon: boolean; priceSatang: number; durationMinutes: number; customerPackageId: null };
type Planned = {
  petId: string;
  petName: string;
  startsAt: string;
  groomerId: string;
  stationId: string;
  groomerPreference: "any" | "specific";
  weightGrams: number | null;
  tierId: string | null;
  coatGroup: "short" | "long" | "any";
  lines: Line[];
};

/**
 * 05#ep-liff.createBooking (grooming for T-0177; stays / daycare → MODULE_DISABLED until M5), one transaction:
 * - per item: liff.groomSlots (module, own pet, blacklist, online-bookable services, size, price) → the R-04 online slot at
 *   startsAt for the chosen groomer, or the first free groomer/station for "any"; earlier items of this booking block
 *   like saved ones. past / beyond horizon / inside the lead time → OUTSIDE_BOOKING_WINDOW; no slot → SLOT_TAKEN; the pet
 *   in an overlapping appointment → PET_ALREADY_BOOKED; R-12 (online) → its first reason; R-11 when the shop enforces
 *   vaccines for grooming: missing/expired → VACCINE_REQUIRED, only pending review → requires approval.
 * - R-03 totals, R-06 deposit for this customer, R-08 approval (auto_confirm_grooming off, reliability 1 or a pending
 *   vaccine) and deadlines; R-23 booking number under the branch lock.
 * - booking ∅ → awaiting_deposit (deposit > 0, hold + expire_hold) | awaiting_approval (approval_due_at + approval_overdue)
 *   | confirmed; children ∅ → scheduled with booking_event; reminder_24h jobs; customer.booking_received (awaiting_*) or
 *   customer.booking_confirmed, and staff.new_booking to active front_desk + owner (Q-1049).
 * Returns MyBookingDetail (PaymentInstruction when a deposit is due).
 */
export async function liffCreateBooking(
  ctx: RequestContext,
  input: LiffCreateBookingRequest & { branchSlug: string },
): Promise<LiffCreateBookingResponse> {
  if (input.stays.length || input.daycare.length) throw new AppError("MODULE_DISABLED");
  const db = getDb();
  const repo = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  const c = await liffCustomer(ctx, db);
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
  if (!policy) throw new AppError("NOT_FOUND");
  const planId = await defaultPlanId(ctx, db, b.id);

  const planned: Planned[] = [];
  let vaccinePending = false;
  const buffer = policy.bufferMinutes;
  /** end of an earlier item's block (services + shop buffer) */
  const blockedUntil = (p: Planned) => Date.parse(p.startsAt) + (p.lines.reduce((sum, l) => sum + l.durationMinutes, 0) + buffer) * MINUTE;
  /** an active station with no saved or planned appointment over `window` */
  const freeStation = async (window: { s: number; e: number }): Promise<string | null> => {
    const stations = (await repo
      .select(groomStation, and(eq(groomStation.branchId, b.id), eq(groomStation.status, "active")))
      .orderBy(asc(groomStation.sortOrder), asc(groomStation.id))) as (typeof groomStation.$inferSelect)[];
    const taken = (await repo.select(
      groomAppointment,
      and(
        eq(groomAppointment.branchId, b.id),
        notInArray(groomAppointment.status, [...RELEASED]),
        lt(groomAppointment.startsAt, new Date(window.e)),
        gt(groomAppointment.blockedUntil, new Date(window.s)),
      ),
    )) as (typeof groomAppointment.$inferSelect)[];
    const used = new Set([
      ...taken.map((a) => a.stationId),
      ...planned.filter((p) => overlaps({ s: Date.parse(p.startsAt), e: blockedUntil(p) }, window)).map((p) => p.stationId),
    ]);
    return stations.find((st) => !used.has(st.id))?.id ?? null;
  };
  for (const item of input.groom) {
    const date = toLocalDate({ instant: item.startsAt, timezone: b.timezone });
    const slotInput = { date, petId: item.petId, serviceIds: item.serviceIds, addonIds: item.addonIds, sizeTierId: item.sizeTierId };
    const slots = await liffGroomSlots(ctx, { ...slotInput, groomerId: item.groomerId });
    const start = Date.parse(item.startsAt);
    if (slots.reason === "past" || slots.reason === "beyond_horizon" || start < ctx.now.getTime() + policy.bookingLeadMinutes * MINUTE)
      throw new AppError("OUTSIDE_BOOKING_WINDOW");
    const window = { s: start, e: start + slots.durationMinutes * MINUTE };
    const blocked = { s: window.s, e: window.e + policy.bufferMinutes * MINUTE };

    // the same pet cannot be in two overlapping grooming appointments (saved or earlier in this booking)
    const petBusy = (await repo.select(
      groomAppointment,
      and(
        eq(groomAppointment.petId, item.petId),
        notInArray(groomAppointment.status, [...RELEASED]),
        lt(groomAppointment.startsAt, new Date(window.e)),
        gt(groomAppointment.endsAt, new Date(window.s)),
      ),
    )) as unknown[];
    if (
      petBusy.length ||
      planned.some((p) => p.petId === item.petId && overlaps({ s: Date.parse(p.startsAt), e: blockedUntil(p) }, window))
    )
      throw new AppError("PET_ALREADY_BOOKED");
    // R-04 slot at startsAt. liff.groomSlots does not see earlier items of this booking, so a clash with them falls back
    // to the next groomer (when "any") and the next free station.
    const busy = (key: "groomerId" | "stationId", id: string) =>
      planned.some((p) => p[key] === id && overlaps({ s: Date.parse(p.startsAt), e: blockedUntil(p) }, blocked));
    let slot: { groomerId: string; stationId: string } | null = null;
    const first = slots.slots.find((x) => Date.parse(x.startsAt) === start);
    if (first && !busy("groomerId", first.groomerId) && !busy("stationId", first.stationId)) slot = first;
    else if (planned.length) {
      const groomerIds = item.groomerId
        ? [item.groomerId]
        : (
            (await repo
              .select(staffUser, and(eq(staffUser.isGroomer, true), eq(staffUser.status, "active")))
              .orderBy(asc(staffUser.sortOrder), asc(staffUser.id))) as (typeof staffUser.$inferSelect)[]
          ).map((g) => g.id);
      for (const groomerId of groomerIds) {
        if (busy("groomerId", groomerId)) continue;
        const own =
          groomerId === first?.groomerId
            ? first
            : (await liffGroomSlots(ctx, { ...slotInput, groomerId })).slots.find((x) => Date.parse(x.startsAt) === start);
        if (!own) continue;
        const stationId = busy("stationId", own.stationId) ? await freeStation(blocked) : own.stationId;
        if (stationId) {
          slot = { groomerId, stationId };
          break;
        }
      }
    }
    if (!slot) throw new AppError("SLOT_TAKEN");

    // R-12 on the online channel for each main service
    const subject = await shopPet(ctx, db, b.id, item.petId);
    const ids = [...new Set([...item.serviceIds, ...item.addonIds])];
    const services = (await repo.select(
      service,
      and(eq(service.branchId, b.id), inArray(service.id, ids)),
    )) as (typeof service.$inferSelect)[];
    for (const s of services.filter((x) => item.serviceIds.includes(x.id))) {
      const verdict = checkEligibility({
        channel: "online",
        customer: { blacklisted: c.blacklisted },
        pet: {
          status: subject.row.status,
          species: subject.row.species,
          breed: subject.row.breed,
          weightGrams: subject.row.latestWeightGrams,
          ageMonths: ageInMonths({
            onDate: date,
            birthDate: subject.row.birthDate,
            ageEstimateMonths: subject.row.ageEstimateMonths,
            estimateRecordedOn: toLocalDate({ instant: subject.row.createdAt.toISOString(), timezone: b.timezone }),
          }),
          flags: subject.flags,
        },
        policy: { rejectedBreeds: policy.rejectedBreeds, maxPetWeightGrams: policy.maxPetWeightGrams },
        speciesAllowed: s.speciesAllowed,
        roomType: null,
        inHeat: false,
      });
      if (!verdict.ok) throw new AppError(verdict.reasons[0] as "CUSTOMER_BLACKLISTED");
    }

    // R-11 when the shop enforces vaccines for grooming
    if (policy.enforceVaccinesGrooming && subject.row.species !== "other") {
      const vaccinations = await db.select().from(petVaccination).where(eq(petVaccination.petId, item.petId));
      const gate = checkVaccines({
        requiredCodes: subject.row.species === "dog" ? policy.requiredVaccinesDog : policy.requiredVaccinesCat,
        vaccinations: vaccinations.map((v) => ({ code: v.vaccineCode, expiresOn: v.expiresOn, status: v.status })),
        mustBeValidOn: date,
      });
      if (gate.missing.length || gate.expired.length)
        throw new AppError("VACCINE_REQUIRED", { petId: item.petId, missing: gate.missing, expired: gate.expired });
      if (gate.pendingReview.length) vaccinePending = true;
    }

    // R-01/R-02 per line: the weight wins, else the customer's size choice (as liff.groomSlots)
    const tierId = subject.row.species !== "other" && subject.row.latestWeightGrams === null ? (item.sizeTierId ?? null) : subject.tierId;
    const prices = planId
      ? ((await repo.select(
          servicePrice,
          and(eq(servicePrice.ratePlanId, planId), inArray(servicePrice.serviceId, ids)),
        )) as (typeof servicePrice.$inferSelect)[])
      : [];
    const coatGroup = coatGroupOf({ coatType: subject.row.coatType });
    const lines: Line[] = [...item.serviceIds, ...item.addonIds].map((serviceId) => {
      const found = lookupServicePrice({ serviceId, sizeTierId: tierId, coatGroup, prices });
      if (!found) throw new AppError("PRICE_NOT_FOUND");
      const s = services.find((x) => x.id === serviceId) as typeof service.$inferSelect;
      return { serviceId, name: s.nameTh, isAddon: s.isAddon, ...found, customerPackageId: null };
    });
    planned.push({
      petId: item.petId,
      petName: subject.row.name,
      startsAt: new Date(start).toISOString(),
      groomerId: slot.groomerId,
      stationId: slot.stationId,
      groomerPreference: item.groomerId ? "specific" : "any",
      weightGrams: subject.row.latestWeightGrams,
      tierId,
      coatGroup,
      lines,
    });
  }

  // R-03 totals, R-06 deposit, R-08 approval + deadlines
  const quote = quoteBooking({
    bufferMinutes: policy.bufferMinutes,
    groom: planned.map((p) => ({ startsAt: p.startsAt, items: p.lines })),
  });
  if ("error" in quote) throw new AppError("VALIDATION_FAILED", { fields: { groom: quote.error } });
  const level = (c.reliabilityOverride ?? c.reliabilityLevel) as 1 | 2 | 3 | 4;
  const deposit = computeDeposit({
    estimatedTotalSatang: quote.estimatedTotalSatang,
    policy: { type: policy.defaultDepositType, value: policy.defaultDepositValue },
    customer: { depositExempt: c.depositExempt, reliabilityLevel: level },
  }).depositRequiredSatang;
  const requiresApproval = !policy.autoConfirmGrooming || level === 1 || vaccinePending;
  const deadlines = computeBookingDeadlines({
    createdAt: ctx.now.toISOString(),
    depositRequiredSatang: deposit,
    requiresApproval,
    holdMinutes: policy.holdMinutes,
    approvalTimeoutMinutes: policy.approvalTimeoutMinutes,
  });
  const status = deposit > 0 ? "awaiting_deposit" : requiresApproval ? "awaiting_approval" : "confirmed";
  const firstServiceAt = new Date(Math.min(...planned.map((p) => Date.parse(p.startsAt))));

  const bookingId = await withTx(ctx, async (tx) => {
    const t = tenantDb(ctx, tx);
    // R-23: the branch row lock serialises booking numbers
    const [locked] = (await t.select(branch, eq(branch.id, b.id)).for("update")) as (typeof branch.$inferSelect)[];
    if (!locked) throw new AppError("NOT_FOUND");
    const no = nextBookingNo({
      now: ctx.now.toISOString(),
      timezone: b.timezone,
      counter: { month: locked.bookingSeqMonth, nextSeq: locked.bookingNextSeq },
    });
    await t.update(branch, { bookingSeqMonth: no.counter.month, bookingNextSeq: no.counter.nextSeq }, eq(branch.id, b.id));

    const [bk] = (await t.insert(booking, {
      branchId: b.id,
      customerId: c.id,
      bookingNo: no.bookingNo,
      // Q-1049: LIFF bookings are line_liff (the request does not say it came from the booking link)
      channel: "line_liff",
      createdByType: "customer",
      createdById: c.id,
      status,
      estimatedTotalSatang: quote.estimatedTotalSatang,
      depositRequiredSatang: deposit,
      depositStatus: deposit > 0 ? "pending" : "not_required",
      holdExpiresAt: deadlines.holdExpiresAt ? new Date(deadlines.holdExpiresAt) : null,
      approvalDueAt: deadlines.approvalDueAt ? new Date(deadlines.approvalDueAt) : null,
      policySnapshot: policy,
      customerNote: input.customerNote ?? null,
      confirmedAt: status === "confirmed" ? ctx.now : null,
      firstServiceAt,
      createdAt: ctx.now,
    })) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("INTERNAL");
    await writeBookingEvent(tx, ctx, { bookingId: bk.id, entityType: "booking", entityId: bk.id, from: null, to: status });
    if (bk.holdExpiresAt)
      await scheduleJob(tx, {
        type: "expire_hold",
        runAt: bk.holdExpiresAt,
        payload: { bookingId: bk.id },
        dedupeKey: `expire_hold:${bk.id}:${bk.holdExpiresAt.toISOString()}`,
        orgId: b.organizationId,
      });
    if (bk.approvalDueAt)
      await scheduleJob(tx, {
        type: "approval_overdue",
        runAt: bk.approvalDueAt,
        payload: { bookingId: bk.id, n: 1 },
        dedupeKey: `approval_overdue:${bk.id}:1`,
        orgId: b.organizationId,
      });

    for (const [i, p] of planned.entries()) {
      const q = quote.groom[i];
      if (!q) throw new AppError("INTERNAL");
      const [appt] = (await t.insert(groomAppointment, {
        branchId: b.id,
        bookingId: bk.id,
        petId: p.petId,
        groomerId: p.groomerId,
        groomerPreference: p.groomerPreference,
        stationId: p.stationId,
        startsAt: new Date(p.startsAt),
        endsAt: new Date(q.endsAt),
        blockedUntil: new Date(q.blockedUntil),
        sizeTierId: p.tierId,
        coatGroup: p.coatGroup,
        weightGramsAtBooking: p.weightGrams,
        servicesTotalSatang: q.servicesTotalSatang,
        createdAt: ctx.now,
      })) as (typeof groomAppointment.$inferSelect)[];
      if (!appt) throw new AppError("INTERNAL");
      await t.insert(
        groomAppointmentItem,
        p.lines.map((l) => ({ appointmentId: appt.id, ...l, nameSnapshot: l.name, createdAt: ctx.now })),
      );
      await writeBookingEvent(tx, ctx, {
        bookingId: bk.id,
        entityType: "groom_appointment",
        entityId: appt.id,
        from: null,
        to: "scheduled",
      });
      // 07 §2: not set when the appointment is less than 24 h away
      const runAt = new Date(appt.startsAt.getTime() - DAY_MS);
      if (runAt > ctx.now)
        await scheduleJob(tx, {
          type: "reminder_24h",
          runAt,
          payload: { bookingId: bk.id, entityType: "groom_appointment", entityId: appt.id },
          dedupeKey: `reminder_24h:${appt.id}:${appt.startsAt.toISOString()}`,
          orgId: b.organizationId,
        });
    }

    const notifyCtx = { ...ctx, branchId: b.id, timezone: b.timezone };
    const summary = planned.map((p) => `${p.petName}: ${p.lines.map((l) => l.name).join(", ")}`).join(" / ");
    const bookingUrl = new URL(`/liff/${b.bookingSlug}/bookings/${bk.id}`, process.env.APP_BASE_URL).toString();
    // SP-03 reply token is not available to this endpoint; the dispatcher pushes (essential) (Q-1049)
    if (status === "confirmed")
      await enqueueNotification(tx, notifyCtx, {
        key: "customer.booking_confirmed",
        recipient: { type: "customer", id: c.id },
        payload: {
          bookingNo: bk.bookingNo,
          summary,
          dateTime: `${formatThaiDate({ date: toLocalDate({ instant: firstServiceAt.toISOString(), timezone: b.timezone }) })} ${formatTime({ instant: firstServiceAt.toISOString(), timezone: b.timezone })}`,
          shopName: b.name,
          bookingUrl,
        },
        dedupeKey: `booking_confirmed:${bk.id}`,
      });
    else
      await enqueueNotification(tx, notifyCtx, {
        key: "customer.booking_received",
        recipient: { type: "customer", id: c.id },
        payload: {
          shopName: b.name,
          bookingNo: bk.bookingNo,
          summary,
          depositAmount: deposit,
          holdExpiresTime: bk.holdExpiresAt?.toISOString() ?? "",
          bookingUrl,
        },
        dedupeKey: `booking_received:${bk.id}`,
      });
    // owner_profile has no organization_id: the id comes from the org-checked customer
    const [owner] = await tx.select({ firstName: ownerProfile.firstName }).from(ownerProfile).where(eq(ownerProfile.id, c.ownerProfileId));
    const staff = (await t.select(
      staffUser,
      and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of staff)
      await enqueueNotification(tx, notifyCtx, {
        key: "staff.new_booking",
        recipient: { type: "staff", id: member.id },
        payload: { bookingNo: bk.bookingNo, customerName: owner?.firstName ?? "", summary },
        dedupeKey: `new_booking:${bk.id}`,
      });
    return bk.id;
  });
  return liffBooking(ctx, { branchSlug: input.branchSlug, bookingId });
}
