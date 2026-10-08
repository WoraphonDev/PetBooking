// L-04 จองกรูม: pure helpers for the four steps (น้อง → บริการ → วันเวลา → ยืนยัน).

import type { MyPet } from "@app/contracts/dto/my-pet";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { LiffCreateBookingRequest, LiffCreateBookingResponse } from "@app/contracts/endpoints/liff.createBooking";
import type { LiffGroomSlotsRequest } from "@app/contracts/endpoints/liff.groomSlots";
import type { LiffQuoteRequest } from "@app/contracts/endpoints/liff.quote";
import type { LiffShopResponse } from "@app/contracts/endpoints/liff.shop";
import { coatGroupOf } from "@app/domain/pricing/price-lookup";
import type { SlotChoice } from "../shared/slots";

export const NOTE_MAX = 300;
export const DAYS = 14;

/** one pet's part of the booking */
export type PetDraft = { petId: string; serviceIds: string[]; addonIds: string[]; slot: SlotChoice | null };

const bookable = (s: ServiceItem, pet: Pick<MyPet, "species">) =>
  s.scope === "grooming" && s.status === "active" && s.onlineBookable && s.speciesAllowed.includes(pet.species);

/** บริการหลัก for this pet: active, online-bookable grooming services that are not add-ons and accept its species */
export function mainServices(services: ServiceItem[], pet: Pick<MyPet, "species">): ServiceItem[] {
  return services.filter((s) => !s.isAddon && bookable(s, pet)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Add-on for this pet: bookable add-ons for any service, or for one of the chosen main services */
export function addonServices(services: ServiceItem[], pet: Pick<MyPet, "species">, mainIds: string[]): ServiceItem[] {
  return services
    .filter((s) => s.isAddon && bookable(s, pet))
    .filter((s) => s.addonForServiceIds.length === 0 || s.addonForServiceIds.some((id) => mainIds.includes(id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * R-02 price + duration of this pet when its coat group leaves one answer (e.g. one price for every size), else null
 * (the size tier comes from the weight on the server; the card then shows the from-price, Q-1051).
 */
export function petPrice(service: ServiceItem, pet: Pick<MyPet, "coatType">): { priceSatang: number; durationMinutes: number } | null {
  const group = coatGroupOf({ coatType: pet.coatType });
  const rows = service.prices.filter((p) => p.coatGroup === group || p.coatGroup === "any");
  const first = rows[0];
  if (!first) return null;
  return rows.every((r) => r.priceSatang === first.priceSatang && r.durationMinutes === first.durationMinutes)
    ? { priceSatang: first.priceSatang, durationMinutes: first.durationMinutes }
    : null;
}

/** แถบวัน 14 วัน from today; a weekday the shop is closed (or has no hours row) is disabled */
export function dayStrip(today: string, hours: LiffShopResponse["hours"]): { date: string; closed: boolean }[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const h = hours.find((x) => x.weekday === d.getUTCDay());
    return { date: d.toISOString().slice(0, 10), closed: !h || h.isClosed };
  });
}

export function slotsRequest(draft: PetDraft, date: string, groomerId: string | null): LiffGroomSlotsRequest {
  return {
    date,
    petId: draft.petId,
    serviceIds: draft.serviceIds,
    addonIds: draft.addonIds,
    ...(groomerId ? { groomerId } : {}),
  };
}

/** liff.quote: every pet with its picked slot (the slot's groomer and station) */
export function quoteBody(drafts: PetDraft[]): LiffQuoteRequest | null {
  if (!drafts.length || drafts.some((d) => !d.slot || !d.serviceIds.length)) return null;
  return {
    groom: drafts.map((d) => ({
      petId: d.petId,
      serviceIds: d.serviceIds,
      addonIds: d.addonIds,
      startsAt: d.slot?.startsAt ?? "",
      groomerId: d.slot?.groomerId ?? "",
      stationId: d.slot?.stationId ?? "",
    })),
    stays: [],
    daycare: [],
  };
}

/** liff.createBooking: 'ใครก็ได้' leaves groomerId out, so the server can re-pick a free groomer (Q-1049) */
export function createBody(drafts: PetDraft[], groomerId: string | null, note: string): LiffCreateBookingRequest {
  return {
    groom: drafts.map((d) => ({
      petId: d.petId,
      serviceIds: d.serviceIds,
      addonIds: d.addonIds,
      startsAt: d.slot?.startsAt ?? "",
      ...(groomerId ? { groomerId } : {}),
    })),
    stays: [],
    daycare: [],
    ...(note.trim() ? { customerNote: note.trim() } : {}),
    acceptedPolicy: true,
  };
}

/** หลังสำเร็จ: a deposit to pay → L-07; otherwise 'จองสำเร็จ' or 'รอร้านยืนยัน' */
export function afterCreate(result: LiffCreateBookingResponse): "pay" | "confirmed" | "awaiting_approval" {
  if (result.booking.status === "awaiting_deposit") return "pay";
  return result.booking.status === "awaiting_approval" ? "awaiting_approval" : "confirmed";
}
