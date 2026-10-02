import { localToUtc, toLocalDate } from "../time/local-time.ts";

type SlotInput = {
  date: string;
  timezone: string;
  now: string;
  channel: "online" | "staff";
  policy: {
    slotStepMinutes: number;
    bufferMinutes: number;
    bookingLeadMinutes: number;
    bookingHorizonDays: number;
    maxAppointmentsPerDay: number | null;
    maxAppointmentsPerGroomerDay: number | null;
  };
  branchHours: { isClosed: boolean; opensAt: string | null; closesAt: string | null };
  closures: { startsAt: string; endsAt: string; scope: "all" | "grooming" | "hotel" | "daycare" }[];
  stationIds: string[]; // active stations ordered by sort_order
  groomers: {
    id: string;
    sortOrder: number;
    workingHours: { startsAt: string; endsAt: string; breakStartsAt: string | null; breakEndsAt: string | null } | null;
    timeOff: { startsAt: string; endsAt: string }[];
  }[];
  appointments: { groomerId: string; stationId: string; startsAt: string; blockedUntil: string }[]; // active, same local day
  durationMinutes: number;
  groomerPreference: { type: "any" } | { type: "specific"; groomerId: string };
};
type SlotResult = {
  slots: { startsAt: string; groomerId: string; stationId: string }[];
  reason: "ok" | "closed" | "past" | "beyond_horizon" | "day_full" | "no_capacity";
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) => start < otherEnd && otherStart < end;
const empty = (reason: SlotResult["reason"]): SlotResult => ({ slots: [], reason });

export function computeGroomSlots(input: SlotInput): SlotResult {
  const { branchHours, policy, date, timezone } = input;
  if (branchHours.isClosed || branchHours.opensAt === null || branchHours.closesAt === null) return empty("closed");
  const now = Date.parse(input.now);
  if (input.channel === "online") {
    const today = toLocalDate({ instant: input.now, timezone });
    if (date < today) return empty("past");
    // UTC midnights here represent calendar-day ordinals, not instants in the shop's timezone.
    if ((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY > policy.bookingHorizonDays) {
      return empty("beyond_horizon");
    }
  }
  if (policy.maxAppointmentsPerDay !== null && input.appointments.length >= policy.maxAppointmentsPerDay) return empty("day_full");
  const wall = (time: string) => Date.parse(localToUtc({ date, time, timezone }));
  const appointments = input.appointments.map((a) => ({ ...a, start: Date.parse(a.startsAt), end: Date.parse(a.blockedUntil) }));
  const closures = input.closures
    .filter((c) => c.scope === "all" || c.scope === "grooming")
    .map((c) => ({ start: Date.parse(c.startsAt), end: Date.parse(c.endsAt) }));
  const preference = input.groomerPreference;
  const groomers = input.groomers
    .flatMap((g) => {
      if (preference.type === "specific" && g.id !== preference.groomerId) return [];
      const hours = g.workingHours;
      if (!hours) return [];
      const booked = appointments.filter((a) => a.groomerId === g.id);
      if (policy.maxAppointmentsPerGroomerDay !== null && booked.length >= policy.maxAppointmentsPerGroomerDay) return [];
      return [
        {
          id: g.id,
          sortOrder: g.sortOrder,
          start: wall(hours.startsAt),
          end: wall(hours.endsAt),
          breakStart: hours.breakStartsAt === null ? null : wall(hours.breakStartsAt),
          breakEnd: hours.breakEndsAt === null ? null : wall(hours.breakEndsAt),
          timeOff: g.timeOff.map((off) => ({ start: Date.parse(off.startsAt), end: Date.parse(off.endsAt) })),
          booked,
          load: booked.reduce((sum, a) => sum + a.end - a.start, 0),
        },
      ];
    })
    .sort((a, b) => a.load - b.load || a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const duration = input.durationMinutes * MINUTE;
  const step = policy.slotStepMinutes * MINUTE;
  const close = wall(branchHours.closesAt);
  const slots: SlotResult["slots"] = [];
  for (let start = wall(branchHours.opensAt); start + duration <= close; start += step) {
    if (input.channel === "online" ? start < now + policy.bookingLeadMinutes * MINUTE : start + step <= now) continue;
    const end = start + duration;
    const blockedUntil = end + policy.bufferMinutes * MINUTE;
    if (closures.some((c) => overlaps(start, end, c.start, c.end))) continue;
    const stationId = input.stationIds.find(
      (id) => !appointments.some((a) => a.stationId === id && overlaps(start, blockedUntil, a.start, a.end)),
    );
    if (stationId === undefined) continue;
    const groomer = groomers.find(
      (g) =>
        start >= g.start &&
        end <= g.end &&
        !(g.breakStart !== null && g.breakEnd !== null && overlaps(start, end, g.breakStart, g.breakEnd)) &&
        !g.timeOff.some((off) => overlaps(start, end, off.start, off.end)) &&
        !g.booked.some((a) => overlaps(start, blockedUntil, a.start, a.end)),
    );
    if (groomer) slots.push({ startsAt: new Date(start).toISOString(), groomerId: groomer.id, stationId });
  }
  return { slots, reason: slots.length > 0 ? "ok" : "no_capacity" };
}
