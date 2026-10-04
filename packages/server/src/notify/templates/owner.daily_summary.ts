// 07 §1 owner.daily_summary: Web Push or email to every owner; date/money arrive formatted by the job (R-31); subject per Q-0060.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(p: NotificationPayloads["owner.daily_summary"]): Rendered {
  return {
    subject: `สรุปประจำวัน ${p.date ?? ""}`,
    text: `สรุป ${p.date ?? ""}: กรูม ${p.groomCount ?? ""} ตัว, พัก ${p.staysInHouse ?? ""}, ยอดขาย ${p.salesTotal ?? ""}, no-show ${p.noShows ?? ""} | พรุ่งนี้ ${p.tomorrowCount ?? ""} นัด`,
  };
}
