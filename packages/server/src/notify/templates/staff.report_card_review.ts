// 07 §1 staff.report_card_review: Web Push to front_desk when a report card awaits review.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.report_card_review"]): Rendered {
  return { text: `Report card ของ ${payload.petName ?? ""} รอตรวจ` };
}
