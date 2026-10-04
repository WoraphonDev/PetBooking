import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import type { DaycareVisitItem } from "@app/contracts/dto/daycare-visit-item";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { SlipItem } from "@app/contracts/dto/slip-item";
import type { StayCard } from "@app/contracts/dto/stay-card";
import type { BookingsGetRequest, BookingsGetResponse } from "@app/contracts/endpoints/bookings.get";
import {
  appointmentSurcharge,
  booking,
  bookingEvent,
  branch,
  branchPolicy,
  consentDocument,
  customer,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  ownerProfile,
  paymentSlip,
  petVaccination,
  roomType,
  roomUnit,
  staffUser,
  stay,
  stayIntake,
} from "@app/db/schema";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { checkVaccines } from "@app/domain/pet/vaccine-gate";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { customersGet } from "../customers/get.ts";
import { customerListItems } from "../customers/list.ts";

type BookingRow = typeof booking.$inferSelect;
type ApptRow = typeof groomAppointment.$inferSelect;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/** owner name/phone, customer and PetSummary per customer — shared by the card builders below */
async function people(ctx: RequestContext, db: Executor, customerIds: string[]) {
  const repo = tenantDb(ctx, db);
  const customers = customerIds.length
    ? ((await repo.select(customer, inArray(customer.id, unique(customerIds)))) as (typeof customer.$inferSelect)[])
    : [];
  const owners = customers.length
    ? await db
        .select()
        .from(ownerProfile)
        .where(
          inArray(
            ownerProfile.id,
            customers.map((c) => c.ownerProfileId),
          ),
        )
    : [];
  // customers.get already computes PetSummary (R-11 vaccine status, R-12 age)
  const pets = new Map<string, PetSummary>();
  for (const c of customers) for (const p of (await customersGet(ctx, { customerId: c.id })).pets) pets.set(p.id, p);
  const customerOf = new Map(customers.map((c) => [c.id, c]));
  const ownerOf = new Map(customers.map((c) => [c.id, owners.find((o) => o.id === c.ownerProfileId)]));
  return { customerOf, ownerOf, pets };
}

/** AppointmentCard for saved appointments (any bookings of this org). */
export async function appointmentCards(ctx: RequestContext, db: Executor, appts: ApptRow[]): Promise<AppointmentCard[]> {
  if (appts.length === 0) return [];
  const repo = tenantDb(ctx, db);
  const bookings = (await repo.select(booking, inArray(booking.id, unique(appts.map((a) => a.bookingId))))) as BookingRow[];
  const bookingOf = new Map(bookings.map((b) => [b.id, b]));
  const { customerOf, ownerOf, pets } = await people(
    ctx,
    db,
    bookings.map((b) => b.customerId),
  );
  const ids = appts.map((a) => a.id);
  const items = (await repo
    .select(groomAppointmentItem, inArray(groomAppointmentItem.appointmentId, ids))
    .orderBy(asc(groomAppointmentItem.createdAt), asc(groomAppointmentItem.id))) as (typeof groomAppointmentItem.$inferSelect)[];
  const surcharges = (await repo
    .select(appointmentSurcharge, inArray(appointmentSurcharge.appointmentId, ids))
    .orderBy(asc(appointmentSurcharge.createdAt), asc(appointmentSurcharge.id))) as (typeof appointmentSurcharge.$inferSelect)[];
  const groomers = (await repo.select(
    staffUser,
    inArray(staffUser.id, unique(appts.map((a) => a.groomerId))),
  )) as (typeof staffUser.$inferSelect)[];
  const stations = (await repo.select(
    groomStation,
    inArray(groomStation.id, unique(appts.map((a) => a.stationId))),
  )) as (typeof groomStation.$inferSelect)[];

  return appts.map((a) => {
    const bk = bookingOf.get(a.bookingId);
    const pet = pets.get(a.petId);
    if (!bk || !pet) throw new AppError("NOT_FOUND");
    const owner = ownerOf.get(bk.customerId);
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
      surcharges: surcharges
        .filter((x) => x.appointmentId === a.id)
        .map((x) => ({ id: x.id, name: x.name, amountSatang: x.amountSatang, reason: x.reason })),
      servicesTotalSatang: a.servicesTotalSatang,
      surchargeTotalSatang: a.surchargeTotalSatang,
      depositStatus: bk.depositStatus,
      reliabilityLevel: customerOf.get(bk.customerId)?.reliabilityLevel ?? 3,
      fromStayId: a.fromStayId,
      checkedInAt: iso(a.checkedInAt),
      startedAt: iso(a.startedAt),
      doneAt: iso(a.doneAt),
      pickedUpAt: iso(a.pickedUpAt),
      staffNote: a.staffNote,
    };
  });
}

/** BookingDetail of one booking of this org (NOT_FOUND otherwise). */
export async function bookingDetail(ctx: RequestContext, db: Executor, bookingId: string): Promise<BookingDetail> {
  const repo = tenantDb(ctx, db);
  const [bk] = (await repo.select(booking, eq(booking.id, bookingId))) as BookingRow[];
  if (!bk) throw new AppError("NOT_FOUND");
  const [c] = (await repo.select(customer, eq(customer.id, bk.customerId))) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const [listItem] = await customerListItems(db, [c]);
  if (!listItem) throw new AppError("NOT_FOUND");
  const { ownerOf, pets } = await people(ctx, db, [c.id]);
  const owner = ownerOf.get(c.id);
  const [br] = (await repo.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];

  const appts = (await repo
    .select(groomAppointment, eq(groomAppointment.bookingId, bk.id))
    .orderBy(asc(groomAppointment.startsAt), asc(groomAppointment.id))) as ApptRow[];
  const groom = await appointmentCards(ctx, db, appts);

  // stays: room names, intake, boarding agreement, R-11 against check_out_date
  const stays = (await repo
    .select(stay, eq(stay.bookingId, bk.id))
    .orderBy(asc(stay.checkInDate), asc(stay.id))) as (typeof stay.$inferSelect)[];
  let stayCards: StayCard[] = [];
  if (stays.length) {
    const sIds = stays.map((s) => s.id);
    const types = (await repo.select(
      roomType,
      inArray(roomType.id, unique(stays.map((s) => s.roomTypeId))),
    )) as (typeof roomType.$inferSelect)[];
    const unitIds = stays.flatMap((s) => (s.roomUnitId ? [s.roomUnitId] : []));
    const units = unitIds.length ? ((await repo.select(roomUnit, inArray(roomUnit.id, unitIds))) as (typeof roomUnit.$inferSelect)[]) : [];
    const intakes = (await repo.select(stayIntake, inArray(stayIntake.stayId, sIds))) as (typeof stayIntake.$inferSelect)[];
    const agreements = (await repo.select(
      consentDocument,
      and(inArray(consentDocument.stayId, sIds), eq(consentDocument.kind, "boarding_agreement")),
    )) as (typeof consentDocument.$inferSelect)[];
    const [policy] = await db.select().from(branchPolicy).where(eq(branchPolicy.branchId, bk.branchId));
    const vaccinations = await db
      .select()
      .from(petVaccination)
      .where(inArray(petVaccination.petId, unique(stays.map((s) => s.petId))));
    stayCards = stays.map((s) => {
      const pet = pets.get(s.petId);
      if (!pet) throw new AppError("NOT_FOUND");
      const required =
        pet.species === "dog" ? (policy?.requiredVaccinesDog ?? []) : pet.species === "cat" ? (policy?.requiredVaccinesCat ?? []) : [];
      return {
        id: s.id,
        bookingId: bk.id,
        bookingNo: bk.bookingNo,
        status: s.status,
        pet,
        customerName: owner?.firstName ?? "",
        roomTypeName: types.find((t) => t.id === s.roomTypeId)?.nameTh ?? "",
        roomUnitId: s.roomUnitId,
        roomCode: units.find((u) => u.id === s.roomUnitId)?.code ?? null,
        checkInDate: s.checkInDate,
        checkOutDate: s.checkOutDate,
        expectedCheckInTime: s.expectedCheckInTime?.slice(0, 5) ?? null,
        expectedCheckOutTime: s.expectedCheckOutTime?.slice(0, 5) ?? null,
        nights: s.nights,
        roomTotalSatang: s.roomTotalSatang,
        inHeat: s.inHeat,
        bundleAppointmentId: s.bundleAppointmentId,
        intakeCompleted: intakes.some((x) => x.stayId === s.id && x.completedAt !== null),
        agreementSigned: agreements.some((x) => x.stayId === s.id),
        vaccineGate: checkVaccines({
          requiredCodes: required,
          vaccinations: vaccinations
            .filter((v) => v.petId === s.petId)
            .map((v) => ({ code: v.vaccineCode, expiresOn: v.expiresOn, status: v.status })),
          mustBeValidOn: s.checkOutDate,
        }),
      };
    });
  }

  const visits = (await repo
    .select(daycareVisit, eq(daycareVisit.bookingId, bk.id))
    .orderBy(asc(daycareVisit.visitDate), asc(daycareVisit.id))) as (typeof daycareVisit.$inferSelect)[];
  const sessions = visits.length
    ? ((await repo.select(
        daycareSessionType,
        inArray(daycareSessionType.id, unique(visits.map((v) => v.sessionTypeId))),
      )) as (typeof daycareSessionType.$inferSelect)[])
    : [];
  const daycare: DaycareVisitItem[] = visits.map((v) => {
    const pet = pets.get(v.petId);
    if (!pet) throw new AppError("NOT_FOUND");
    return {
      id: v.id,
      bookingId: bk.id,
      pet,
      sessionName: sessions.find((s) => s.id === v.sessionTypeId)?.nameTh ?? "",
      visitDate: v.visitDate,
      priceSatang: v.priceSatang,
      status: v.status,
      checkedInAt: iso(v.checkedInAt),
      checkedOutAt: iso(v.checkedOutAt),
    };
  });

  const slipRows = (await repo
    .select(paymentSlip, eq(paymentSlip.bookingId, bk.id))
    .orderBy(asc(paymentSlip.createdAt), asc(paymentSlip.id))) as (typeof paymentSlip.$inferSelect)[];
  const slips: SlipItem[] = [];
  for (const s of slipRows)
    slips.push({
      id: s.id,
      bookingId: s.bookingId,
      bookingNo: bk.bookingNo,
      billId: s.billId,
      customerName: owner?.firstName ?? "",
      imageUrl: await signedUrl(db, ctx, s.fileId).catch(() => null),
      amountExpectedSatang: s.amountExpectedSatang,
      transRef: s.transRef,
      isDuplicate: s.duplicateOfSlipId !== null,
      duplicateOfSlipId: s.duplicateOfSlipId,
      status: s.status,
      uploadedAt: s.createdAt.toISOString(),
      reviewedAt: iso(s.reviewedAt),
      rejectReason: s.rejectReason,
      holdExpiresAt: iso(bk.holdExpiresAt),
    });

  const events = (await repo
    .select(bookingEvent, eq(bookingEvent.bookingId, bk.id))
    .orderBy(asc(bookingEvent.createdAt), asc(bookingEvent.id))) as (typeof bookingEvent.$inferSelect)[];

  // PaymentInstruction while a deposit is due and the branch can take PromptPay (R-30)
  const due = bk.depositRequiredSatang - bk.depositVerifiedSatang;
  const qr =
    ["pending", "rejected"].includes(bk.depositStatus) && due > 0 && br?.promptpayType && br.promptpayId
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
    stays: stayCards,
    daycare,
    slips,
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

/** 05#ep-bookings.get */
export async function bookingsGet(ctx: RequestContext, input: BookingsGetRequest): Promise<BookingsGetResponse> {
  requireRole(ctx, "bookings.get");
  return bookingDetail(ctx, getDb(), input.bookingId);
}
