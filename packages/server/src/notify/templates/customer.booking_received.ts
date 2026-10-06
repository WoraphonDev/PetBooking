// 07 §1 customer.booking_received (LINE reply/push). {depositLine} is composed here from depositAmount (satang) and
// holdExpiresTime (ISO instant) per 07 §1.2; bookingUrl doubles as the message's link (Q-1048).
import { formatTHB, formatTime } from "@app/domain/format/thai";
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

/** the payload carries no branch timezone; 06 default until it does (Q-1048) */
const TIME_ZONE = "Asia/Bangkok";

export function depositLine(depositAmount: string | number | undefined, holdExpiresTime: string | number | undefined): string {
  const satang = Number(depositAmount ?? 0);
  if (!(satang > 0)) return "ร้านจะยืนยันคิวให้เร็ว ๆ นี้ค่ะ";
  // formatTime gives "HH:mm น."; 07 writes the "น." itself
  const time = holdExpiresTime ? formatTime({ instant: String(holdExpiresTime), timezone: TIME_ZONE }).replace(/ น\.$/, "") : "";
  return `กรุณาชำระมัดจำ ${formatTHB({ satang })} ภายใน ${time} น. เพื่อยืนยันคิว`;
}

export function render(payload: NotificationPayloads["customer.booking_received"]): Rendered {
  const text = [
    `ได้รับการจอง ${payload.bookingNo ?? ""} แล้ว 🐾`,
    String(payload.summary ?? ""),
    depositLine(payload.depositAmount, payload.holdExpiresTime),
    `ดูรายละเอียด: ${payload.bookingUrl ?? ""}`,
  ].join("\n");
  return { text, ...(payload.bookingUrl ? { url: String(payload.bookingUrl) } : {}) };
}
