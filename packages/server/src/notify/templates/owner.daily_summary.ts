// owner.daily_summary — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "สรุป {date}: กรูม {groomCount} ตัว, พัก {staysInHouse}, ยอดขาย {salesTotal}, no-show {noShows} | พรุ่งนี้ {tomorrowCount} นัด";

export function render(payload: NotificationPayloads["owner.daily_summary"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
