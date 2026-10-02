import { expect, it } from "vitest";
import { generateCareTasks } from "../../../src/care/care-tasks.ts";

const base = {
  checkedInAt: "2026-10-10T00:00:00.000Z",
  checkOutDate: "2026-10-10",
  expectedCheckOutTime: "18:00",
  timezone: "Asia/Bangkok",
  feedingTimes: [] as string[],
  medications: [] as { id: string; name: string; times: string[] }[],
  walksPerDay: 0,
};

it("excludes tasks exactly at check-in and checkout, retaining instants strictly between them", () => {
  const tasks = generateCareTasks({
    ...base,
    checkedInAt: "2026-10-10T01:00:00.000Z",
    expectedCheckOutTime: "10:00",
    feedingTimes: ["08:00", "08:01", "09:59", "10:00"],
  });
  expect(tasks).toEqual([
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2026-10-10T01:01:00.000Z", medicationId: null },
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2026-10-10T02:59:00.000Z", medicationId: null },
  ]);
});
it.each([
  [0, []],
  [1, ["09:00"]],
  [2, ["02:00", "10:00"]],
  [3, ["02:00", "06:00", "10:00"]],
  [4, ["02:00", "04:30", "07:30", "10:00"]],
  [5, ["02:00", "04:00", "06:00", "08:00", "10:00"]],
  [6, ["02:00", "03:30", "05:00", "07:00", "08:30", "10:00"]],
] as const)("schedules %i walks at the specified local times rounded to 30 minutes", (walksPerDay, times) => {
  const walks = generateCareTasks({ ...base, walksPerDay }).filter((task) => task.taskType === "walk");
  expect(walks).toEqual(
    times.map((time) => ({ taskType: "walk", title: "พาเดินเล่น", dueAt: `2026-10-10T${time}:00.000Z`, medicationId: null })),
  );
});
it("defaults checkout to local noon and excludes noon and later tasks", () => {
  const tasks = generateCareTasks({ ...base, expectedCheckOutTime: null, feedingTimes: ["11:59", "12:00", "13:00"] });
  expect(tasks).toEqual([
    { taskType: "clean", title: "ทำความสะอาดห้อง", dueAt: "2026-10-10T03:00:00.000Z", medicationId: null },
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2026-10-10T04:59:00.000Z", medicationId: null },
  ]);
});
it("uses the local check-in date across UTC midnight and a month/year boundary", () => {
  const tasks = generateCareTasks({
    ...base,
    checkedInAt: "2026-12-31T17:30:00.000Z",
    checkOutDate: "2027-01-02",
    expectedCheckOutTime: "02:00",
    feedingTimes: ["01:00"],
  });
  expect(tasks).toEqual([
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2026-12-31T18:00:00.000Z", medicationId: null },
    { taskType: "clean", title: "ทำความสะอาดห้อง", dueAt: "2027-01-01T03:00:00.000Z", medicationId: null },
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2027-01-01T18:00:00.000Z", medicationId: null },
  ]);
});
it("converts each day's wall-clock schedule independently across a daylight-saving change", () => {
  const tasks = generateCareTasks({
    ...base,
    checkedInAt: "2026-03-07T05:00:00.000Z",
    checkOutDate: "2026-03-09",
    expectedCheckOutTime: "09:00",
    timezone: "America/New_York",
    feedingTimes: ["08:00"],
  });
  expect(tasks.filter((task) => task.taskType === "feed").map((task) => task.dueAt)).toEqual([
    "2026-03-07T13:00:00.000Z",
    "2026-03-08T12:00:00.000Z",
    "2026-03-09T12:00:00.000Z",
  ]);
  expect(tasks.filter((task) => task.taskType === "clean").map((task) => task.dueAt)).toEqual([
    "2026-03-07T15:00:00.000Z",
    "2026-03-08T14:00:00.000Z",
  ]);
});
it("sorts ties by taskType then title, keeps medication IDs and does not mutate inputs", () => {
  const input = {
    ...base,
    feedingTimes: ["10:00"],
    medications: [
      { id: "z", name: "Z", times: ["10:00"] },
      { id: "a", name: "A", times: ["10:00"] },
    ],
  };
  const original = structuredClone(input);
  expect(generateCareTasks(input)).toEqual([
    { taskType: "clean", title: "ทำความสะอาดห้อง", dueAt: "2026-10-10T03:00:00.000Z", medicationId: null },
    { taskType: "feed", title: "ให้อาหาร", dueAt: "2026-10-10T03:00:00.000Z", medicationId: null },
    { taskType: "medication", title: "ให้ยา A", dueAt: "2026-10-10T03:00:00.000Z", medicationId: "a" },
    { taskType: "medication", title: "ให้ยา Z", dueAt: "2026-10-10T03:00:00.000Z", medicationId: "z" },
  ]);
  expect(input).toEqual(original);
});
it("returns no tasks when check-in is at or after checkout", () => {
  expect(generateCareTasks({ ...base, checkedInAt: "2026-10-10T11:00:00.000Z", feedingTimes: ["18:00"] })).toEqual([]);
  expect(generateCareTasks({ ...base, checkedInAt: "2026-10-11T00:00:00.000Z" })).toEqual([]);
});
