// 06#scr-C-05 — booking detail helpers.
import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import type { BookingsCancelRequest } from "@app/contracts/endpoints/bookings.cancel";
import type { BookingsRecordDepositRequest } from "@app/contracts/endpoints/bookings.recordDeposit";

/** ยกเลิกใบจอง shows while the booking is active (03 booking state machine) */
const ACTIVE = new Set<BookingDetail["status"]>(["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"]);
export const isActive = (status: BookingDetail["status"]) => ACTIVE.has(status);

/** branch_policy copy at booking time (bookings.create stores the row in camelCase) */
export function policyLine(
  snapshot: Record<string, unknown>,
): { grooming: number; hotel: number; daycare: number; forfeit: number } | null {
  const n = (k: string) => (typeof snapshot[k] === "number" ? (snapshot[k] as number) : null);
  const [grooming, hotel, daycare, forfeit] = [
    n("groomingFreeCancelHours"),
    n("hotelFreeCancelHours"),
    n("daycareFreeCancelHours"),
    n("lateCancelForfeitPercent"),
  ];
  return grooming === null || hotel === null || daycare === null || forfeit === null ? null : { grooming, hotel, daycare, forfeit };
}
export const offersChoice = (snapshot: Record<string, unknown>) => snapshot.cancelRefundMode === "customer_choice";

/** status enum per booking_event.entity_type, for the timeline labels */
export const EVENT_ENUM = {
  booking: "booking_status",
  groom_appointment: "groom_status",
  stay: "stay_status",
  daycare_visit: "daycare_status",
} as const;

export type CancelForm = { kind: BookingsCancelRequest["kind"] | null; reason: string; customerChoice: "refund" | "credit" | null };
/** bookings.cancel body; null until who + a reason (≥ 3) are given */
export function cancelBody(form: CancelForm, withChoice: boolean): BookingsCancelRequest | null {
  const reason = form.reason.trim();
  if (!form.kind || reason.length < 3 || reason.length > 500) return null;
  return {
    kind: form.kind,
    reason,
    ...(withChoice && form.kind === "customer_cancel" && form.customerChoice ? { customerChoice: form.customerChoice } : {}),
  };
}

/** 06 ปุ่ม/การกระทำ (ext-M3) — แสดงเมื่อ */
export const canDecide = (b: Pick<BookingDetail, "status">) => b.status === "awaiting_approval";
export const canRecordDeposit = (b: Pick<BookingDetail, "depositStatus">) =>
  b.depositStatus === "pending" || b.depositStatus === "rejected";
export const canWaiveDeposit = (b: Pick<BookingDetail, "depositStatus">) => b.depositStatus === "pending";
/** "มีบิล open": BookingDetail has the bill id but not its status — the server refuses a closed bill (Q-1023) */
export const canSendBalance = (b: Pick<BookingDetail, "billId">) => b.billId !== null;

/** reasons for decline / waive (contract 3–500) */
export const reasonOk = (reason: string) => reason.trim().length >= 3 && reason.trim().length <= 500;

export const DEPOSIT_METHODS = ["cash", "promptpay", "bank_transfer", "card_edc"] as const;
export type DepositForm = {
  method: BookingsRecordDepositRequest["method"] | null;
  /** satang; null = empty, undefined = not a valid amount */
  amountSatang: number | null | undefined;
  reference: string;
  proofFileId: string | null;
};
/** ยอด starts at what is still due (required − verified) */
export const emptyDeposit = (b: Pick<BookingDetail, "depositRequiredSatang" | "depositVerifiedSatang">): DepositForm => ({
  method: null,
  amountSatang: Math.max(0, b.depositRequiredSatang - b.depositVerifiedSatang) || null,
  reference: "",
  proofFileId: null,
});
export type DepositErrors = Partial<Record<"method" | "amountSatang" | "reference", true>>;
/** bookings.recordDeposit body: วิธี บังคับ · ยอด > 0 · เลขอ้างอิง ≤ 100 · รูปหลักฐาน optional */
export function depositBody(f: DepositForm): { body: BookingsRecordDepositRequest | null; errors: DepositErrors } {
  const errors: DepositErrors = {};
  const reference = f.reference.trim();
  if (!f.method) errors.method = true;
  if (f.amountSatang == null || f.amountSatang <= 0) errors.amountSatang = true;
  if (reference.length > 100) errors.reference = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return {
    body: {
      method: f.method as BookingsRecordDepositRequest["method"],
      amountSatang: f.amountSatang as number,
      ...(reference ? { reference } : {}),
      ...(f.proofFileId ? { proofFileId: f.proofFileId } : {}),
    },
    errors,
  };
}
