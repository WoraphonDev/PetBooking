// staff.groom_done — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "{petName} เสร็จแล้ว ({groomerName}) — กดแจ้งลูกค้ามารับ";

export function render(payload: NotificationPayloads["staff.groom_done"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
