import { localToUtc, toLocalDate } from "../time/local-time.ts";

export function generateCareTasks(input: {
  checkedInAt: string;
  checkOutDate: string;
  expectedCheckOutTime: string | null;
  timezone: string;
  feedingTimes: string[];
  medications: { id: string; name: string; times: string[] }[];
  walksPerDay: number;
}): { taskType: "feed" | "medication" | "walk" | "clean"; title: string; dueAt: string; medicationId: string | null }[] {
  type Task = { taskType: "feed" | "medication" | "walk" | "clean"; title: string; dueAt: string; medicationId: string | null };
  const tasks: Task[] = [];
  const startsAt = Date.parse(input.checkedInAt);
  const endsAt = Date.parse(
    localToUtc({ date: input.checkOutDate, time: input.expectedCheckOutTime ?? "12:00", timezone: input.timezone }),
  );
  const walkTimes = Array.from({ length: input.walksPerDay }, (_, i) => {
    // Half-up rounding in 30-minute units, using integer numerator/denominator arithmetic.
    const denominator = input.walksPerDay - 1;
    const minutes = input.walksPerDay === 1 ? 16 * 60 : 9 * 60 + 30 * Math.floor((32 * i + denominator) / (2 * denominator));
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  });
  for (
    let date = toLocalDate({ instant: input.checkedInAt, timezone: input.timezone });
    date <= input.checkOutDate;
    date = nextDate(date)
  ) {
    const add = (taskType: Task["taskType"], title: string, time: string, medicationId: string | null = null) => {
      const dueAt = localToUtc({ date, time, timezone: input.timezone });
      const instant = Date.parse(dueAt);
      if (startsAt < instant && instant < endsAt) tasks.push({ taskType, title, dueAt, medicationId });
    };
    for (const time of input.feedingTimes) add("feed", "ให้อาหาร", time);
    for (const medication of input.medications)
      for (const time of medication.times) add("medication", `ให้ยา ${medication.name}`, time, medication.id);
    for (const time of walkTimes) add("walk", "พาเดินเล่น", time);
    add("clean", "ทำความสะอาดห้อง", "10:00");
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return tasks.sort((a, b) => compare(a.dueAt, b.dueAt) || compare(a.taskType, b.taskType) || compare(a.title, b.title));
}

/** Advance a local calendar-date label; UTC arithmetic here never advances a scheduled instant by 24 hours. */
function nextDate(date: string): string {
  const calendar = new Date(`${date}T00:00:00.000Z`);
  calendar.setUTCDate(calendar.getUTCDate() + 1);
  return calendar.toISOString().slice(0, 10);
}
