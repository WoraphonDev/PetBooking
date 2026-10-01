// staff.invite — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "คุณได้รับเชิญเข้าร่วมร้าน {shopName} — {inviteUrl} (หมดอายุใน 7 วัน)";

export function render(payload: NotificationPayloads["staff.invite"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
