// 06#scr-C-05 — booking detail helpers.
import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import type { BookingsCancelRequest } from "@app/contracts/endpoints/bookings.cancel";

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
