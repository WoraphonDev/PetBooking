// customer.no_show — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "วันนี้ไม่พบ{petName}ตามนัด {moneyLine}\nนัดใหม่ได้ที่ {bookAgainUrl}";

export function render(payload: NotificationPayloads["customer.no_show"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
