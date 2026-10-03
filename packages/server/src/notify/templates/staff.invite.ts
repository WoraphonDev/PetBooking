// 07 §1 staff.invite: email-only. The email adapter uses this text as subject too (Q-0060).
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.invite"]): { text: string } {
  return { text: `คุณได้รับเชิญเข้าร่วมร้าน ${payload.shopName ?? ""} — ${payload.inviteUrl ?? ""} (หมดอายุใน 7 วัน)` };
}
