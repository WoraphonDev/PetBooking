// 07 §1 owner.support_access: Web Push or email to every owner when platform support opens the shop; subject per Q-0060.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["owner.support_access"]): Rendered {
  return {
    subject: "ทีมงานเข้าดูข้อมูลร้านของคุณ",
    text: `ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: ${payload.reason ?? ""}`,
  };
}
