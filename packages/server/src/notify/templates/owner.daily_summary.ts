// owner.daily_summary — 07 §1 text; email subject per Q-0060 (stub text: the template task for this key replaces the body).
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";
import type { Rendered } from "./index.ts";

const TEXT = "สรุป {date}: กรูม {groomCount} ตัว, พัก {staysInHouse}, ยอดขาย {salesTotal}, no-show {noShows} | พรุ่งนี้ {tomorrowCount} นัด";

export function render(payload: NotificationPayloads["owner.daily_summary"]): Rendered {
  return { subject: fill("สรุปประจำวัน {date}", payload), text: fill(TEXT, payload) };
}
