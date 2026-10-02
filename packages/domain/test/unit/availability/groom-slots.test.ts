import { expect, it } from "vitest";
import { computeGroomSlots } from "../../../src/availability/groom-slots.ts";

type Input = Parameters<typeof computeGroomSlots>[0];
const input = (): Input => ({
  date: "2026-10-05",
  timezone: "Asia/Bangkok",
  now: "2026-10-04T05:00:00.000Z",
  channel: "online",
  policy: {
    slotStepMinutes: 30,
    bufferMinutes: 15,
    bookingLeadMinutes: 120,
    bookingHorizonDays: 60,
    maxAppointmentsPerDay: null,
    maxAppointmentsPerGroomerDay: null,
  },
  branchHours: { isClosed: false, opensAt: "09:00", closesAt: "10:00" },
  closures: [],
  stationIds: ["st-2", "st-1"],
  groomers: [
    { id: "g-a", sortOrder: 1, workingHours: { startsAt: "09:00", endsAt: "10:00", breakStartsAt: null, breakEndsAt: null }, timeOff: [] },
  ],
  appointments: [],
  durationMinutes: 30,
  groomerPreference: { type: "any" },
});
const starts = (i: Input) => computeGroomSlots(i).slots.map((slot) => slot.startsAt);
const freeze = (value: unknown): void => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
};

it("permits work ending at closing while its buffer extends past closing", () => {
  expect(computeGroomSlots(input())).toEqual({
    reason: "ok",
    slots: [
      { startsAt: "2026-10-05T02:00:00.000Z", groomerId: "g-a", stationId: "st-2" },
      { startsAt: "2026-10-05T02:30:00.000Z", groomerId: "g-a", stationId: "st-2" },
    ],
  });
});
it("checks closures, breaks and time off against work only with half-open boundaries", () => {
  for (const kind of ["closure", "break", "timeOff"] as const) {
    const i = input();
    if (kind === "closure") i.closures = [{ startsAt: "2026-10-05T02:30:00Z", endsAt: "2026-10-05T03:00:00Z", scope: "all" }];
    if (kind === "break" && i.groomers[0]?.workingHours)
      Object.assign(i.groomers[0].workingHours, { breakStartsAt: "09:30", breakEndsAt: "10:00" });
    if (kind === "timeOff" && i.groomers[0]) i.groomers[0].timeOff = [{ startsAt: "2026-10-05T02:30:00Z", endsAt: "2026-10-05T03:00:00Z" }];
    expect(starts(i)).toEqual(["2026-10-05T02:00:00.000Z"]);
  }
});
it("checks station buffer overlap and permits an appointment starting exactly at buffer end", () => {
  const i = input();
  i.appointments = [{ groomerId: "other", stationId: "st-2", startsAt: "2026-10-05T02:45:00Z", blockedUntil: "2026-10-05T03:15:00Z" }];
  expect(computeGroomSlots(i).slots.map((s) => s.stationId)).toEqual(["st-2", "st-1"]);
  i.stationIds = ["st-2"];
  expect(starts(i)).toEqual(["2026-10-05T02:00:00.000Z"]);
});
it("checks groomer buffer conflicts even when the selected station is free", () => {
  const i = input();
  i.appointments = [{ groomerId: "g-a", stationId: "other", startsAt: "2026-10-05T02:45:00Z", blockedUntil: "2026-10-05T03:15:00Z" }];
  expect(starts(i)).toEqual(["2026-10-05T02:00:00.000Z"]);
});
it("chooses by total blocked time, then sortOrder and id without changing inputs", () => {
  const i = input();
  const hours = i.groomers[0]?.workingHours ?? null;
  i.groomers = [
    { id: "g-z", sortOrder: 0, workingHours: hours, timeOff: [] },
    { id: "g-b", sortOrder: 2, workingHours: hours, timeOff: [] },
    { id: "g-a", sortOrder: 2, workingHours: hours, timeOff: [] },
  ];
  i.appointments = [{ groomerId: "g-z", stationId: "other", startsAt: "2026-10-05T00:00:00Z", blockedUntil: "2026-10-05T01:00:00Z" }];
  const before = structuredClone(i);
  freeze(i);
  expect(computeGroomSlots(i).slots.map((s) => s.groomerId)).toEqual(["g-a", "g-a"]);
  expect(i).toEqual(before);
  const changed = structuredClone(before);
  changed.groomers[1] = { ...changed.groomers[1], id: "g-b", sortOrder: 1, workingHours: hours, timeOff: [] };
  expect(computeGroomSlots(changed).slots.map((s) => s.groomerId)).toEqual(["g-b", "g-b"]);
});
it("keeps the current staff step until its exact end and accepts the exact online lead", () => {
  const i = input();
  i.channel = "staff";
  i.now = "2026-10-05T02:29:59.999Z";
  expect(starts(i)).toHaveLength(2);
  i.now = "2026-10-05T02:30:00.000Z";
  expect(starts(i)).toEqual(["2026-10-05T02:30:00.000Z"]);
  i.channel = "online";
  i.now = "2026-10-05T00:00:00.000Z";
  expect(starts(i)).toHaveLength(2);
  i.now = "2026-10-05T00:00:00.001Z";
  expect(starts(i)).toEqual(["2026-10-05T02:30:00.000Z"]);
});
it("uses the branch local date and inclusive calendar-day horizon", () => {
  const i = input();
  i.now = "2026-10-04T17:00:00Z";
  i.policy.bookingHorizonDays = 0;
  expect(computeGroomSlots(i).reason).toBe("ok");
  i.now = "2026-10-03T17:00:00Z";
  expect(computeGroomSlots(i).reason).toBe("beyond_horizon");
  i.policy.bookingHorizonDays = 1;
  expect(computeGroomSlots(i).reason).toBe("ok");
  i.now = "2026-10-05T17:00:00Z";
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "past" });
});
it("counts calendar days across DST rather than elapsed local-midnight hours", () => {
  const i = input();
  i.timezone = "America/New_York";
  i.date = "2026-11-02";
  i.now = "2026-11-01T04:00:00Z";
  i.policy.bookingHorizonDays = 1;
  expect(starts(i)).toEqual(["2026-11-02T14:00:00.000Z", "2026-11-02T14:30:00.000Z"]);
});
it("returns no capacity for absent stations, working hours or a specific unknown groomer", () => {
  const i = input();
  i.stationIds = [];
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "no_capacity" });
  i.stationIds = ["st-1"];
  if (i.groomers[0]) i.groomers[0].workingHours = null;
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "no_capacity" });
  i.groomerPreference = { type: "specific", groomerId: "missing" };
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "no_capacity" });
});
it("applies zero daily caps", () => {
  const i = input();
  i.policy.maxAppointmentsPerDay = 0;
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "day_full" });
  i.policy.maxAppointmentsPerDay = null;
  i.policy.maxAppointmentsPerGroomerDay = 0;
  expect(computeGroomSlots(i)).toEqual({ slots: [], reason: "no_capacity" });
});
