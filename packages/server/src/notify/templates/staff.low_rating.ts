// 07 §1 staff.low_rating: Web Push to owner for a rating of 3 stars or less.
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.low_rating"]): { text: string } {
  return { text: `ลูกค้าให้ ${payload.rating ?? ""} ดาว (${payload.petName ?? ""}): ${payload.feedback ?? ""}` };
}
