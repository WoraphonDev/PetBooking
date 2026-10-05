// 06#scr-C-03 (grooming tab) — pure helpers behind the new-booking form, kept out of the component so they are testable.
import type { CustomerPackageItem } from "@app/contracts/dto/customer-package-item";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { Quote } from "@app/contracts/dto/quote";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import type { AvailabilityGroomSlotsRequest } from "@app/contracts/endpoints/availability.groomSlots";
import type { BookingsCreateRequest } from "@app/contracts/endpoints/bookings.create";
import type { QuotesCreateRequest } from "@app/contracts/endpoints/quotes.create";
import { coatGroupOf, lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { resolveSizeTier } from "@app/domain/pricing/size-tier";
import type { SlotChoice } from "../shared/slots";

export const CHANNELS = ["walk_in", "phone", "chat"] as const;
export type Channel = (typeof CHANNELS)[number];
export const NOTE_MAX = 500;

/** one pet's grooming appointment while the form is being filled */
export type PetDraft = {
  petId: string;
  serviceIds: string[];
  addonIds: string[];
  /** R-01 = no_weight: size picked by the shop */
  sizeTierId: string | null;
  customerPackageId: string | null;
  /** null = ใครก็ได้ (groomer_preference any) */
  groomerId: string | null;
  date: string;
  /** must be one of the R-04 slots shown */
  slot: SlotChoice | null;
  /** endsAt of the chosen slot — blocks it for the next pets of this booking */
  slotEndsAt: string | null;
};

export const newPetDraft = (petId: string, date: string): PetDraft => ({
  petId,
  serviceIds: [],
  addonIds: [],
  sizeTierId: null,
  customerPackageId: null,
  groomerId: null,
  date,
  slot: null,
  slotEndsAt: null,
});

/** chips: only active pets can be booked */
export const bookablePets = (pets: PetSummary[]) => pets.filter((p) => p.status === "active");

/** R-01 for the pet; the shop picks a size only when the weight is unknown */
export function sizeTierOf(pet: PetSummary, tiers: SizeTierItem[]) {
  const dogCat = tiers.filter((t): t is SizeTierItem & { species: "dog" | "cat" } => t.species !== "other");
  return resolveSizeTier({ species: pet.species, weightGrams: pet.latestWeightGrams, tiers: dogCat });
}
export const needsSize = (pet: PetSummary, tiers: SizeTierItem[]) => sizeTierOf(pet, tiers).reason === "no_weight";
/** tier used for prices/slots: the shop's pick when R-01 = no_weight, else R-01's */
export const effectiveTierId = (pet: PetSummary, tiers: SizeTierItem[], draft: Pick<PetDraft, "sizeTierId">) =>
  needsSize(pet, tiers) ? draft.sizeTierId : sizeTierOf(pet, tiers).tierId;
export const sizeOptions = (pet: PetSummary, tiers: SizeTierItem[]) =>
  tiers.filter((t) => t.species === pet.species).sort((a, b) => a.sortOrder - b.sortOrder);

const forPet = (s: ServiceItem, pet: PetSummary) =>
  s.scope === "grooming" && s.status === "active" && (s.speciesAllowed.length === 0 || s.speciesAllowed.includes(pet.species));
/** บริการหลัก: active main grooming services that accept the species */
export const mainServices = (services: ServiceItem[], pet: PetSummary) =>
  services.filter((s) => forPet(s, pet) && !s.isAddon).sort((a, b) => a.sortOrder - b.sortOrder);
/** Add-on: only those linked to a chosen main service */
export const addonServices = (services: ServiceItem[], pet: PetSummary, mainIds: string[]) =>
  services
    .filter((s) => forPet(s, pet) && s.isAddon && s.addonForServiceIds.some((id) => mainIds.includes(id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** R-02 price row of one service for this pet (a lookup of the server's price list — totals still come from quotes.create) */
export function servicePrice(service: ServiceItem, pet: PetSummary, tierId: string | null) {
  return lookupServicePrice({
    serviceId: service.id,
    sizeTierId: tierId,
    coatGroup: coatGroupOf({ coatType: pet.coatType }),
    prices: service.prices.map((p) => ({ ...p, serviceId: service.id })),
  });
}

/**
 * Packages offered in "ใช้แพ็กเกจ": active, sessions left, not expired, this pet's or shared.
 * CustomerPackageItem has no service/size, so the rest of R-14 canRedeem is checked by quotes.create (Q-1009).
 */
export const redeemablePackages = (packages: CustomerPackageItem[], petId: string, now: string) =>
  packages.filter((p) => p.status === "active" && p.sessionsLeft > 0 && p.expiresAt > now && (p.petId === null || p.petId === petId));

/** a removed main service drops the add-ons that no longer link to any chosen main service */
export function toggleMain(draft: PetDraft, serviceId: string, services: ServiceItem[]): PetDraft {
  const serviceIds = draft.serviceIds.includes(serviceId)
    ? draft.serviceIds.filter((id) => id !== serviceId)
    : [...draft.serviceIds, serviceId];
  const addonIds = draft.addonIds.filter((id) => services.find((s) => s.id === id)?.addonForServiceIds.some((m) => serviceIds.includes(m)));
  return { ...draft, serviceIds, addonIds, slot: null, slotEndsAt: null };
}
export const toggleAddon = (draft: PetDraft, serviceId: string): PetDraft => ({
  ...draft,
  addonIds: draft.addonIds.includes(serviceId) ? draft.addonIds.filter((id) => id !== serviceId) : [...draft.addonIds, serviceId],
  slot: null,
  slotEndsAt: null,
});

/**
 * Pets earlier in the list block their chosen slot for the later ones (05#ep-availability.groomSlots pendingAppointments).
 * SlotList has no blockedUntil, so the slot's endsAt is sent; bookings.create re-checks overlaps (SLOT_TAKEN) — Q-1009.
 */
export function pendingBefore(drafts: PetDraft[], index: number): AvailabilityGroomSlotsRequest["pendingAppointments"] {
  return drafts
    .slice(0, index)
    .flatMap((d) =>
      d.slot && d.slotEndsAt
        ? [{ groomerId: d.slot.groomerId, stationId: d.slot.stationId, startsAt: d.slot.startsAt, blockedUntil: d.slotEndsAt }]
        : [],
    );
}

/** availability.groomSlots body for one pet; null until a main service (and a size when R-01 = no_weight) is chosen */
export function slotsRequest(
  draft: PetDraft,
  pet: PetSummary,
  tiers: SizeTierItem[],
  pending: AvailabilityGroomSlotsRequest["pendingAppointments"],
): AvailabilityGroomSlotsRequest | null {
  if (draft.serviceIds.length === 0) return null;
  if (needsSize(pet, tiers) && !draft.sizeTierId) return null;
  return {
    date: draft.date,
    petId: draft.petId,
    serviceIds: draft.serviceIds,
    addonIds: draft.addonIds,
    ...(draft.groomerId ? { groomerId: draft.groomerId } : {}),
    ...(needsSize(pet, tiers) && draft.sizeTierId ? { sizeTierId: draft.sizeTierId } : {}),
    pendingAppointments: pending,
  };
}

/** quotes.create / bookings.create groom items; null while any pet still lacks services or a slot */
export function groomItems(drafts: PetDraft[], pets: PetSummary[], tiers: SizeTierItem[]): QuotesCreateRequest["groom"] | null {
  if (drafts.length === 0) return null;
  const items: QuotesCreateRequest["groom"] = [];
  for (const d of drafts) {
    const pet = pets.find((p) => p.id === d.petId);
    if (!pet || !d.slot || d.serviceIds.length === 0) return null;
    items.push({
      petId: d.petId,
      serviceIds: d.serviceIds,
      addonIds: d.addonIds,
      startsAt: d.slot.startsAt,
      groomerId: d.slot.groomerId,
      stationId: d.slot.stationId,
      groomerPreference: d.groomerId ? "specific" : "any",
      ...(needsSize(pet, tiers) && d.sizeTierId ? { sizeTierId: d.sizeTierId } : {}),
      ...(d.customerPackageId ? { customerPackageId: d.customerPackageId } : {}),
    });
  }
  return items;
}

/** ปรับมัดจำ: sent only when the shop changed the suggested amount; the reason is then required */
export function depositOverride(
  quote: Pick<Quote, "depositRequiredSatang"> | undefined,
  amountSatang: number | null,
  reason: string,
): BookingsCreateRequest["depositOverride"] {
  if (!quote || amountSatang === null || amountSatang === quote.depositRequiredSatang) return undefined;
  return { amountSatang, reason: reason.trim() || undefined };
}

export type PetWarning = { petName: string; kind: "vaccine_missing" | "vaccine_warning" };
/** คำเตือน (R-11): vaccines not complete — shown in the yellow box, never blocks the shop */
export const petWarnings = (pets: PetSummary[]): PetWarning[] =>
  pets.flatMap((p): PetWarning[] =>
    p.vaccineStatus === "missing"
      ? [{ petName: p.name, kind: "vaccine_missing" }]
      : p.vaccineStatus === "warning"
        ? [{ petName: p.name, kind: "vaccine_warning" }]
        : [],
  );

/** YYYY-MM-DD + n days (local calendar arithmetic) */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** bookings.create body (06 ปุ่ม บันทึกการจอง); null while the form is not complete */
export function bookingBody(input: {
  customerId: string | null;
  channel: Channel | null;
  groom: QuotesCreateRequest["groom"] | null;
  note: string;
  override: BookingsCreateRequest["depositOverride"];
}): BookingsCreateRequest | null {
  const { customerId, channel, groom, override } = input;
  const note = input.note.trim();
  if (!customerId || !channel || !groom || note.length > NOTE_MAX || (override && !override.reason)) return null;
  return {
    customerId,
    channel,
    groom,
    stays: [],
    daycare: [],
    ...(note ? { customerNote: note } : {}),
    ...(override ? { depositOverride: override } : {}),
  };
}
