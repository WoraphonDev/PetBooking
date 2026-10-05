// 06#scr-C-07 — slips waiting for review: order, buttons and the slips.verify body.
import type { SlipItem } from "@app/contracts/dto/slip-item";
import type { SlipsVerifyRequest } from "@app/contracts/endpoints/slips.verify";

/** รายการ เรียงเก่า→ใหม่ */
export const oldestFirst = (list: SlipItem[]) => [...list].sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt));

/** ยืนยัน / ปฏิเสธ: submitted only */
export const canReview = (s: Pick<SlipItem, "status">) => s.status === "submitted";
/**
 * ยืนยัน + อนุมัติจอง: "booking ต้องอนุมัติ" — SlipItem has no approval flag (Q-1024), so it shows for every submitted
 * booking slip; the server applies approveBooking only when the booking waits for approval.
 */
export const canApprove = (s: Pick<SlipItem, "status" | "bookingId">) => canReview(s) && s.bookingId !== null;

/** ยอดที่เข้าจริง > 0 (money input; undefined = not a valid amount) */
export function verifyBody(
  amountSatang: number | null | undefined,
  opts: { approveBooking: boolean; confirmDuplicate: boolean },
): SlipsVerifyRequest | null {
  if (amountSatang == null || amountSatang <= 0) return null;
  return { amountSatang, confirmDuplicate: opts.confirmDuplicate, approveBooking: opts.approveBooking };
}

/** "time ago" bucket for ส่งเมื่อ */
export function timeAgo(instant: string, now: number): { key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo"; n: number } {
  const minutes = Math.max(0, Math.floor((now - Date.parse(instant)) / 60_000));
  if (minutes < 1) return { key: "justNow", n: 0 };
  if (minutes < 60) return { key: "minutesAgo", n: minutes };
  if (minutes < 24 * 60) return { key: "hoursAgo", n: Math.floor(minutes / 60) };
  return { key: "daysAgo", n: Math.floor(minutes / (24 * 60)) };
}
