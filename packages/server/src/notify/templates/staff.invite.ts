// 07 §1 staff.invite: email-only, with its own subject (Q-0060).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.invite"]): Rendered {
  return {
    subject: `คำเชิญเข้าร่วมร้าน ${payload.shopName ?? ""}`,
    text: `คุณได้รับเชิญเข้าร่วมร้าน ${payload.shopName ?? ""} — ${payload.inviteUrl ?? ""} (หมดอายุใน 7 วัน)`,
  };
}
