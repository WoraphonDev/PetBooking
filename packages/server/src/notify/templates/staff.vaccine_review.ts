// 07 §1 staff.vaccine_review: Web Push to front_desk when a customer uploads vaccine proof.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.vaccine_review"]): Rendered {
  return { text: `มีหลักฐานวัคซีนของ ${payload.petName ?? ""} รอตรวจ` };
}
