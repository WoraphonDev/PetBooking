// staff.low_rating — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ลูกค้าให้ {rating} ดาว ({petName}): {feedback}";

export function render(payload: NotificationPayloads["staff.low_rating"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
