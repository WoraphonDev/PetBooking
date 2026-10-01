// customer.stay_checked_in — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "{petName}เช็คอินเรียบร้อย ห้อง {roomCode}\nติดตามรูปน้องได้ที่ {updatesUrl}";

export function render(payload: NotificationPayloads["customer.stay_checked_in"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
