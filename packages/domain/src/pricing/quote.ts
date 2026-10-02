// R-03 — booking estimate and appointment end/blocked times (04#R-03). Integer satang only; no discounts or deposits here.

type QuoteInput = {
  bufferMinutes: number;
  groom?: { startsAt: string; items: { priceSatang: number; durationMinutes: number }[] }[];
  stays?: {
    checkInDate: string;
    checkOutDate: string;
    nightlyPriceSatang: number;
    addons?: { unitPriceSatang: number; perDay: boolean; quantity?: number }[];
  }[];
  daycare?: { priceSatang: number }[];
};
type QuoteResult =
  | {
      groom: { servicesTotalSatang: number; durationMinutes: number; endsAt: string; blockedUntil: string }[];
      stays: { nights: number; roomTotalSatang: number; addons: { quantity: number; totalSatang: number }[]; addonsTotalSatang: number }[];
      daycareTotalSatang: number;
      estimatedTotalSatang: number;
    }
  | { error: "DURATION_ZERO" | "INVALID_DATE_RANGE" };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

function addMinutes(instant: string, minutes: number): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant: ${instant}`);
  return new Date(ms + minutes * MINUTE_MS).toISOString();
}

/** calendar days between two local dates (YYYY-MM-DD) */
function daysBetween(from: string, to: string): number {
  const utc = (d: string) => {
    const ms = Date.parse(`${d}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(ms)) throw new RangeError(`invalid local date: ${d}`);
    return ms;
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

export function quoteBooking(input: QuoteInput): QuoteResult {
  const groom = [];
  for (const pet of input.groom ?? []) {
    // 1. per pet: main service + add-ons
    const durationMinutes = sum(pet.items.map((i) => i.durationMinutes));
    if (durationMinutes === 0) return { error: "DURATION_ZERO" };
    // 2. end and buffer-blocked times
    const endsAt = addMinutes(pet.startsAt, durationMinutes);
    groom.push({
      servicesTotalSatang: sum(pet.items.map((i) => i.priceSatang)),
      durationMinutes,
      endsAt,
      blockedUntil: addMinutes(endsAt, input.bufferMinutes),
    });
  }

  const stays = [];
  for (const stay of input.stays ?? []) {
    // 3. nights ≥ 1
    const nights = daysBetween(stay.checkInDate, stay.checkOutDate);
    if (nights < 1) return { error: "INVALID_DATE_RANGE" };
    // 4. per-day add-ons cover every night; others use the given quantity (default 1)
    const addons = (stay.addons ?? []).map((a) => {
      const quantity = a.perDay ? nights : (a.quantity ?? 1);
      return { quantity, totalSatang: quantity * a.unitPriceSatang };
    });
    stays.push({
      nights,
      roomTotalSatang: nights * stay.nightlyPriceSatang,
      addons,
      addonsTotalSatang: sum(addons.map((a) => a.totalSatang)),
    });
  }

  // 5. daycare: one rate per pet per day
  const daycareTotalSatang = sum((input.daycare ?? []).map((d) => d.priceSatang));
  // 6. estimate before deposits/discounts
  const estimatedTotalSatang =
    sum(groom.map((g) => g.servicesTotalSatang)) + sum(stays.map((s) => s.roomTotalSatang + s.addonsTotalSatang)) + daycareTotalSatang;
  return { groom, stays, daycareTotalSatang, estimatedTotalSatang };
}
