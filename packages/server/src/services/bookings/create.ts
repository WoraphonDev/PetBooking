import type { Warning } from "@app/contracts/common";
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import type { BookingsCreateRequest, BookingsCreateResponse } from "@app/contracts/endpoints/bookings.create";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import {
  booking,
  bookingEvent,
  branch,
  branchClosure,
  branchPolicy,
  customer,
  customerPackage,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  ownerProfile,
  packageTemplate,
  petVaccination,
  service,
  servicePrice,
  sizeTier,
  staffUser,
} from "@app/db/schema";
import { checkEligibility } from "@app/domain/booking/eligibility";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { nextBookingNo } from "@app/domain/ids/booking-no";
import { canRedeemPackage } from "@app/domain/package/package";
import { computeDeposit } from "@app/domain/payment/deposit";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { quoteBooking } from "@app/domain/pricing/quote";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, asc, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { writeBookingEvent } from "../../events.ts";
import { scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { availabilityGroomSlots } from "../availability/groomSlots.ts";
import { defaultPlanId, scopedBranch } from "../availability/hotel.ts";
import { customersGet } from "../customers/get.ts";
import { customerListItems } from "../customers/list.ts";
import { customerPet } from "../quotes/create/hotel-daycare.ts";

const DAY_MS = 86_400_000;
/** statuses the groom exclusion constraints ignore */
const RELEASED = ["cancelled", "no_show"] as const;
const overlaps = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.e && b.s < a.e;

type Line = {
  serviceId: string;
  name: string;
  isAddon: boolean;
  priceSatang: number;
  durationMinutes: number;
  customerPackageId: string | null;
};
type Planned = {
  input: BookingsCreateRequest["groom"][number];
  petName: string;
  weightGrams: number | null;
  tierId: string | null;
  coatGroup: "short" | "long" | "any";
  lines: Line[];
  vaccine: ReturnType<typeof checkVaccines> | null;
};

/** 05#ep-bookings.create (grooming; stays/daycare arrive with T-0271): booking ∅ → confirmed in one transaction. */
export async function bookingsCreate(ctx: RequestContext, input: BookingsCreateRequest): Promise<BookingsCreateResponse> {
  requireRole(ctx, "bookings.create");
  const fields: Record<string, string> = {};
  if (input.stays.length) fields.stays = "not yet supported";
  if (input.daycare.length) fields.daycare = "not yet supported";
  if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

  const db = getDb();
  const repo = tenantDb(ctx, db);
  const b = await scopedBranch(ctx, db);
  if (!b.moduleGrooming) throw new AppError("MODULE_DISABLED");
  const [c] = (await repo.select(customer, eq(customer.id, input.customerId))) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
  if (!policy) throw new AppError("NOT_FOUND");
  const planId = await defaultPlanId(ctx, db, b.id);
  const scope = { ctx, db, branchId: b.id, planId, ownerProfileId: c.ownerProfileId };

  const planned: Planned[] = [];
  const pending: { petId: string; groomerId: string; stationId: string; startsAt: string; blockedUntil: string }[] = [];
  for (const [i, item] of input.groom.entries()) {
    const subject = await customerPet(scope, item.petId);
    const ids = [...new Set([...item.serviceIds, ...item.addonIds])];
    const services = (await repo.select(
      service,
      and(eq(service.branchId, b.id), inArray(service.id, ids)),
    )) as (typeof service.$inferSelect)[];
    if (services.length !== ids.length) throw new AppError("NOT_FOUND");

    // R-12 (staff channel: blacklisted customers may still be booked); grooming has no room type
    const date = toLocalDate({ instant: item.startsAt, timezone: b.timezone });
    for (const s of services.filter((x) => item.serviceIds.includes(x.id))) {
      const verdict = checkEligibility({
        channel: "staff",
        customer: { blacklisted: c.blacklisted },
        pet: {
          status: subject.row.status,
          species: subject.row.species,
          breed: subject.row.breed,
          weightGrams: subject.row.latestWeightGrams,
          ageMonths: null,
          flags: subject.flags,
        },
        policy: { rejectedBreeds: policy.rejectedBreeds, maxPetWeightGrams: policy.maxPetWeightGrams },
        speciesAllowed: s.speciesAllowed,
        roomType: null,
        inHeat: false,
      });
      if (!verdict.ok) throw new AppError(verdict.reasons[0] as "PET_INACTIVE");
    }

    // R-04: slots of that local day with this groomer; earlier pets of this booking block like saved ones
    const slots = await availabilityGroomSlots(ctx, {
      date,
      petId: item.petId,
      serviceIds: item.serviceIds,
      addonIds: item.addonIds,
      groomerId: item.groomerId,
      sizeTierId: item.sizeTierId,
      pendingAppointments: pending.map(({ petId: _p, ...a }) => a),
    });
    const startsAt = new Date(item.startsAt);
    const window = { s: startsAt.getTime(), e: startsAt.getTime() + slots.durationMinutes * 60_000 };
    const closures = await db
      .select()
      .from(branchClosure)
      .where(and(eq(branchClosure.branchId, b.id), lt(branchClosure.startsAt, new Date(window.e)), gt(branchClosure.endsAt, startsAt)));
    if (slots.reason === "closed" || closures.some((x) => x.scope === "all" || x.scope === "grooming")) throw new AppError("BRANCH_CLOSED");

    // the same pet cannot be in two overlapping grooming appointments
    const blocked = { s: window.s, e: window.e + policy.bufferMinutes * 60_000 };
    const petBusy = (await repo.select(
      groomAppointment,
      and(
        eq(groomAppointment.petId, item.petId),
        notInArray(groomAppointment.status, [...RELEASED]),
        lt(groomAppointment.startsAt, new Date(window.e)),
        gt(groomAppointment.endsAt, startsAt),
      ),
    )) as unknown[];
    if (
      petBusy.length ||
      pending.some((p) => p.petId === item.petId && overlaps({ s: Date.parse(p.startsAt), e: Date.parse(p.blockedUntil) }, window))
    )
      throw new AppError("PET_ALREADY_BOOKED");
    const slot = slots.slots.find(
      (s) => Date.parse(s.startsAt) === window.s && s.groomerId === item.groomerId && s.stationId === item.stationId,
    );
    if (!slot) throw new AppError("SLOT_TAKEN");

    // R-01/R-02 per line, as quotes.create
    let tierId = subject.tierId;
    if (item.sizeTierId) {
      const [tier] = await repo.select(sizeTier, and(eq(sizeTier.id, item.sizeTierId), eq(sizeTier.branchId, b.id)));
      if (!tier) throw new AppError("NOT_FOUND");
      tierId = item.sizeTierId;
    }
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

    // R-14: the package pays for the main service it covers
    if (item.customerPackageId) {
      const [pack] = (await repo.select(
        customerPackage,
        and(eq(customerPackage.id, item.customerPackageId), eq(customerPackage.customerId, c.id)),
      )) as (typeof customerPackage.$inferSelect)[];
      if (!pack) throw new AppError("NOT_FOUND");
      const [tpl] = (await repo.select(
        packageTemplate,
        eq(packageTemplate.id, pack.templateId),
      )) as (typeof packageTemplate.$inferSelect)[];
      const line = lines.find((l) => !l.isAddon && l.serviceId === tpl?.serviceId);
      const check =
        tpl && line
          ? canRedeemPackage({
              now: ctx.now.toISOString(),
              package: {
                ...pack,
                expiresAt: pack.expiresAt.toISOString(),
                serviceId: tpl.serviceId,
                sizeTierId: tpl.sizeTierId,
                shareScope: tpl.shareScope,
              },
              appointment: { serviceId: line.serviceId, sizeTierId: tierId, petId: item.petId },
            })
          : { ok: false, reason: "service" };
      if (!line || !check.ok)
        throw new AppError("VALIDATION_FAILED", {
          fields: { [`groom.${i}.customerPackageId`]: `package cannot be used (${check.reason})` },
        });
      line.customerPackageId = pack.id;
    }

    // R-11 only when the branch enforces vaccines for grooming — a warning; the gate is at check-in
    let vaccine: Planned["vaccine"] = null;
    if (policy.enforceVaccinesGrooming && subject.row.species !== "other") {
      const vaccinations = await db.select().from(petVaccination).where(eq(petVaccination.petId, item.petId));
      vaccine = checkVaccines({
        requiredCodes: subject.row.species === "dog" ? policy.requiredVaccinesDog : policy.requiredVaccinesCat,
        vaccinations: vaccinations.map((v) => ({ code: v.vaccineCode, expiresOn: v.expiresOn, status: v.status })),
        mustBeValidOn: date,
      });
    }

    planned.push({ input: item, petName: subject.row.name, weightGrams: subject.row.latestWeightGrams, tierId, coatGroup, lines, vaccine });
    pending.push({
      petId: item.petId,
      groomerId: item.groomerId,
      stationId: item.stationId,
      startsAt: item.startsAt,
      blockedUntil: new Date(blocked.e).toISOString(),
    });
  }

  // R-03 totals and times, R-06 deposit (or the shop's override)
  const quote = quoteBooking({
    bufferMinutes: policy.bufferMinutes,
    groom: planned.map((p) => ({ startsAt: p.input.startsAt, items: p.lines })),
  });
  if ("error" in quote) throw new AppError("VALIDATION_FAILED", { fields: { groom: quote.error } });
  const level = (c.reliabilityOverride ?? c.reliabilityLevel) as 1 | 2 | 3 | 4;
  const computed = computeDeposit({
    estimatedTotalSatang: quote.estimatedTotalSatang,
    policy: { type: policy.defaultDepositType, value: policy.defaultDepositValue },
    customer: { depositExempt: c.depositExempt, reliabilityLevel: level },
  }).depositRequiredSatang;
  const deposit = input.depositOverride ? input.depositOverride.amountSatang : computed;
  const firstServiceAt = new Date(Math.min(...planned.map((p) => Date.parse(p.input.startsAt))));

  const bookingId = await withTx(ctx, async (tx) => {
    const t = tenantDb(ctx, tx);
    // R-23: the branch row lock serialises booking numbers
    const [locked] = await tx
      .select()
      .from(branch)
      .where(and(eq(branch.id, b.id), eq(branch.organizationId, b.organizationId)))
      .for("update");
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
      channel: input.channel,
      createdByType: "staff",
      createdById: ctx.actor.id,
      status: "confirmed",
      estimatedTotalSatang: quote.estimatedTotalSatang,
      depositRequiredSatang: deposit,
      depositStatus: deposit > 0 ? "pending" : "not_required",
      policySnapshot: policy,
      customerNote: input.customerNote ?? null,
      confirmedAt: ctx.now,
      firstServiceAt,
      createdAt: ctx.now,
    })) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("INTERNAL");
    await writeBookingEvent(tx, ctx, { bookingId: bk.id, entityType: "booking", entityId: bk.id, from: null, to: "confirmed" });
    if (input.depositOverride)
      await writeAudit(tx, ctx, {
        action: "deposit.waive",
        entityType: "booking",
        entityId: bk.id,
        reason: input.depositOverride.reason ?? null,
        before: { depositRequiredSatang: computed },
        after: { depositRequiredSatang: deposit },
      });

    for (const [i, p] of planned.entries()) {
      const q = quote.groom[i];
      if (!q) throw new AppError("INTERNAL");
      const [appt] = (await t.insert(groomAppointment, {
        branchId: b.id,
        bookingId: bk.id,
        petId: p.input.petId,
        groomerId: p.input.groomerId,
        groomerPreference: p.input.groomerPreference,
        stationId: p.input.stationId,
        startsAt: new Date(p.input.startsAt),
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

    // Q-0091: summary/dateTime wording; the branch has no map URL column yet
    const first = planned.reduce((a, p) => (Date.parse(p.input.startsAt) < Date.parse(a.input.startsAt) ? p : a));
    await enqueueNotification(
      tx,
      { ...ctx, branchId: b.id, timezone: b.timezone },
      {
        key: "customer.booking_confirmed",
        recipient: { type: "customer", id: c.id },
        payload: {
          bookingNo: bk.bookingNo,
          summary: planned.map((p) => `${p.petName}: ${p.lines.map((l) => l.name).join(", ")}`).join(" / "),
          dateTime: `${formatThaiDate({ date: toLocalDate({ instant: first.input.startsAt, timezone: b.timezone }) })} ${formatTime({ instant: first.input.startsAt, timezone: b.timezone })}`,
          shopName: b.name,
          mapUrl: "",
          bookingUrl: new URL(`/liff/${b.bookingSlug}/bookings/${bk.id}`, process.env.APP_BASE_URL).toString(),
        },
        dedupeKey: `booking_confirmed:${bk.id}`,
      },
    );
    return bk.id;
  });

  const detail = await bookingDetail(ctx, db, bookingId);
  const warnings: Warning[] = planned.flatMap((p) =>
    p.vaccine && !p.vaccine.ok
      ? [
          {
            code: "VACCINE_REQUIRED",
            message: ERROR_MESSAGE_TH.VACCINE_REQUIRED,
            data: { petId: p.input.petId, missing: p.vaccine.missing, expired: p.vaccine.expired, pendingReview: p.vaccine.pendingReview },
          },
        ]
      : [],
  );
  return warnings.length ? { ...detail, warnings } : detail;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** BookingDetail of a grooming booking from the saved rows (stays/daycare/slips arrive with their cards). */
async function bookingDetail(ctx: RequestContext, db: Executor, bookingId: string): Promise<BookingDetail> {
  const repo = tenantDb(ctx, db);
  const [bk] = (await repo.select(booking, eq(booking.id, bookingId))) as (typeof booking.$inferSelect)[];
  if (!bk) throw new AppError("NOT_FOUND");
  const [c] = (await repo.select(customer, eq(customer.id, bk.customerId))) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const [listItem] = await customerListItems(db, [c]);
  const [owner] = await db.select().from(ownerProfile).where(eq(ownerProfile.id, c.ownerProfileId));
  const pets = (await customersGet(ctx, { customerId: c.id })).pets;
  const [br] = (await repo.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];

  const appts = (await repo
    .select(groomAppointment, eq(groomAppointment.bookingId, bk.id))
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as (typeof groomAppointment.$inferSelect)[];
  const ids = appts.map((a) => a.id);
  const items = ids.length
    ? ((await repo
        .select(groomAppointmentItem, inArray(groomAppointmentItem.appointmentId, ids))
        .orderBy(asc(groomAppointmentItem.createdAt), asc(groomAppointmentItem.id))) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  const groomers = (await repo.select(
    staffUser,
    inArray(
      staffUser.id,
      appts.map((a) => a.groomerId),
    ),
  )) as (typeof staffUser.$inferSelect)[];
  const stations = (await repo.select(
    groomStation,
    inArray(
      groomStation.id,
      appts.map((a) => a.stationId),
    ),
  )) as (typeof groomStation.$inferSelect)[];
  const events = (await repo
    .select(bookingEvent, eq(bookingEvent.bookingId, bk.id))
    .orderBy(asc(bookingEvent.createdAt), asc(bookingEvent.id))) as (typeof bookingEvent.$inferSelect)[];

  const groom: AppointmentCard[] = appts.map((a) => {
    const pet = pets.find((p) => p.id === a.petId);
    if (!pet) throw new AppError("NOT_FOUND");
    return {
      id: a.id,
      bookingId: bk.id,
      bookingNo: bk.bookingNo,
      status: a.status,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      blockedUntil: a.blockedUntil.toISOString(),
      groomerId: a.groomerId,
      groomerName: groomers.find((g) => g.id === a.groomerId)?.displayName ?? "",
      groomerPreference: a.groomerPreference,
      stationId: a.stationId,
      stationName: stations.find((s) => s.id === a.stationId)?.name ?? "",
      pet,
      customerName: owner?.firstName ?? "",
      customerPhone: owner?.phoneE164 ?? null,
      items: items
        .filter((x) => x.appointmentId === a.id)
        .map((x) => ({
          serviceId: x.serviceId,
          name: x.nameSnapshot,
          isAddon: x.isAddon,
          priceSatang: x.priceSatang,
          durationMinutes: x.durationMinutes,
          customerPackageId: x.customerPackageId,
        })),
      // surcharges are added at check-in (groom.addSurcharge)
      surcharges: [],
      servicesTotalSatang: a.servicesTotalSatang,
      surchargeTotalSatang: a.surchargeTotalSatang,
      depositStatus: bk.depositStatus,
      reliabilityLevel: c.reliabilityLevel,
      fromStayId: a.fromStayId,
      checkedInAt: iso(a.checkedInAt),
      startedAt: iso(a.startedAt),
      doneAt: iso(a.doneAt),
      pickedUpAt: iso(a.pickedUpAt),
      staffNote: a.staffNote,
    };
  });

  // PaymentInstruction when a deposit is still due and the branch can take PromptPay (R-30)
  const due = bk.depositRequiredSatang - bk.depositVerifiedSatang;
  const qr =
    bk.depositStatus === "pending" && due > 0 && br?.promptpayType && br.promptpayId
      ? promptPayPayload({ type: br.promptpayType, id: br.promptpayId, amountSatang: due })
      : null;
  const payment =
    qr && "payload" in qr && br?.promptpayId
      ? {
          amountSatang: due,
          promptpayPayload: qr.payload,
          accountName: br.promptpayAccountName,
          promptpayIdMasked: br.promptpayId.slice(-3),
          expiresAt: iso(bk.holdExpiresAt),
        }
      : null;

  if (!listItem) throw new AppError("NOT_FOUND");
  return {
    id: bk.id,
    bookingNo: bk.bookingNo,
    status: bk.status,
    channel: bk.channel,
    customer: listItem,
    createdByType: bk.createdByType,
    createdAt: bk.createdAt.toISOString(),
    holdExpiresAt: iso(bk.holdExpiresAt),
    approvalDueAt: iso(bk.approvalDueAt),
    estimatedTotalSatang: bk.estimatedTotalSatang,
    depositRequiredSatang: bk.depositRequiredSatang,
    depositStatus: bk.depositStatus,
    depositVerifiedSatang: bk.depositVerifiedSatang,
    policySnapshot: bk.policySnapshot as Record<string, unknown>,
    customerNote: bk.customerNote,
    rescheduleCount: bk.rescheduleCount,
    confirmedAt: iso(bk.confirmedAt),
    cancelledAt: iso(bk.cancelledAt),
    cancelledByType: bk.cancelledByType,
    cancelReason: bk.cancelReason,
    firstServiceAt: iso(bk.firstServiceAt),
    billId: bk.billId,
    groom,
    stays: [],
    daycare: [],
    slips: [],
    payment,
    // same instant: the booking's own row first, then its children in insert order
    events: [...events]
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(b.entityType === "booking") - Number(a.entityType === "booking"),
      )
      .map((e) => ({
        entityType: e.entityType,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actorType: e.actorType,
        reason: e.reason,
        at: e.createdAt.toISOString(),
      })),
  };
}
