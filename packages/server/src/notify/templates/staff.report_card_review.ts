// staff.report_card_review — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "Report card ของ {petName} รอตรวจ";

export function render(payload: NotificationPayloads["staff.report_card_review"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
