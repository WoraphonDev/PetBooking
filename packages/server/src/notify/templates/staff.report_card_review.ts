// 07 §1 staff.report_card_review: Web Push to front_desk when a report card awaits review.
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.report_card_review"]): { text: string } {
  return { text: `Report card ของ ${payload.petName ?? ""} รอตรวจ` };
}
