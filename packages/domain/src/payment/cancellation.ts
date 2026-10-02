// R-07 — deposit outcome of a cancellation or no-show (04#R-07). Always uses booking.policy_snapshot. Integer satang only.

type Module = "grooming" | "hotel" | "daycare";
type CancelInput = {
  now: string;
  firstServiceAt: string;
  modules: Module[];
  kind: "customer_cancel" | "shop_cancel" | "no_show";
  depositVerifiedSatang: number;
  policySnapshot: {
    groomingFreeCancelHours: number;
    hotelFreeCancelHours: number;
    daycareFreeCancelHours: number;
    lateCancelForfeitPercent: number;
    cancelRefundMode: "refund" | "credit" | "customer_choice";
  };
  customerChoice?: "refund" | "credit";
};
type CancelResult = {
  isLate: boolean;
  minutesBefore: number;
  freeCancelHours: number;
  forfeitSatang: number;
  returnSatang: number;
  returnMode: "refund" | "credit" | "none" | null;
};

const MINUTE_MS = 60_000;

function ms(instant: string): number {
  const t = Date.parse(instant);
  if (Number.isNaN(t)) throw new RangeError(`invalid instant: ${instant}`);
  return t;
}

export function computeCancellation(input: CancelInput): CancelResult {
  const deposit = input.depositVerifiedSatang;
  if (!Number.isSafeInteger(deposit) || deposit < 0)
    throw new RangeError(`depositVerifiedSatang must be a non-negative integer: ${deposit}`);
  if (input.modules.length === 0) throw new RangeError("a booking has at least one module");
  const p = input.policySnapshot;

  // 1. whole minutes until the booking's first service (negative once it has passed)
  const minutesBefore = Math.floor((ms(input.firstServiceAt) - ms(input.now)) / MINUTE_MS);
  // 2. the strictest (largest) free-cancel window among the booking's modules
  const hours: Record<Module, number> = {
    grooming: p.groomingFreeCancelHours,
    hotel: p.hotelFreeCancelHours,
    daycare: p.daycareFreeCancelHours,
  };
  const freeCancelHours = Math.max(...input.modules.map((m) => hours[m]));

  let isLate: boolean;
  let forfeitSatang: number;
  if (input.kind === "shop_cancel") {
    // 4. the shop cancels: nothing forfeited, full return
    isLate = false;
    forfeitSatang = 0;
  } else if (input.kind === "no_show") {
    // 5. no-show forfeits the whole deposit regardless of the percentage
    isLate = true;
    forfeitSatang = deposit;
  } else {
    // 3. customer cancels: late inside the window → forfeit floor(deposit × pct / 100)
    isLate = minutesBefore < freeCancelHours * 60;
    forfeitSatang = isLate ? Math.floor((deposit * p.lateCancelForfeitPercent) / 100) : 0;
  }

  // 6. the rest goes back by the snapshot's mode (customer_choice → their pick, default credit); shop cancels refund unless credit is chosen
  const returnSatang = deposit - forfeitSatang;
  const mode =
    input.kind === "shop_cancel"
      ? (input.customerChoice ?? "refund")
      : p.cancelRefundMode === "customer_choice"
        ? (input.customerChoice ?? "credit")
        : p.cancelRefundMode;
  return { isLate, minutesBefore, freeCancelHours, forfeitSatang, returnSatang, returnMode: returnSatang === 0 ? "none" : mode };
}
