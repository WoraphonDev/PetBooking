// R-21 — what a customer may do on "my bookings" (04#R-21). The API re-checks this on every request.

const CANCELLABLE = new Set(["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed"]);
const RESCHEDULABLE = new Set(["confirmed", "awaiting_approval"]);
const RESCHEDULE_LIMIT = 2;
const HOUR_MS = 3_600_000;

function ms(instant: string): number {
  const t = Date.parse(instant);
  if (Number.isNaN(t)) throw new RangeError(`invalid instant: ${instant}`);
  return t;
}

export function customerSelfService(input: {
  now: string;
  firstServiceAt: string;
  status: string;
  rescheduleCutoffHours: number;
  rescheduleCount: number;
}): {
  canCancel: boolean;
  canReschedule: boolean;
  rescheduleBlockedReason: "STATUS_NOT_ALLOWED" | "TOO_LATE_TO_RESCHEDULE" | "RESCHEDULE_LIMIT" | null;
} {
  const remainingMs = ms(input.firstServiceAt) - ms(input.now);
  // 1. cancel while the status allows it and the first service has not started (money effect per R-07)
  const canCancel = CANCELLABLE.has(input.status) && remainingMs > 0;
  // 2. reschedule: status, then the cutoff, then at most 2 reschedules
  const rescheduleBlockedReason = !RESCHEDULABLE.has(input.status)
    ? "STATUS_NOT_ALLOWED"
    : remainingMs < input.rescheduleCutoffHours * HOUR_MS
      ? "TOO_LATE_TO_RESCHEDULE"
      : input.rescheduleCount >= RESCHEDULE_LIMIT
        ? "RESCHEDULE_LIMIT"
        : null;
  return { canCancel, canReschedule: rescheduleBlockedReason === null, rescheduleBlockedReason };
}
