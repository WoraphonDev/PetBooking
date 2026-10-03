// 07 §1 staff.groom_done: Web Push to front_desk when the groomer finishes.
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.groom_done"]): { text: string } {
  return { text: `${payload.petName ?? ""} เสร็จแล้ว (${payload.groomerName ?? ""}) — กดแจ้งลูกค้ามารับ` };
}
