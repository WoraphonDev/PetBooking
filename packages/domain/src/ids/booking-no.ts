// R-23 — booking number B{BE year 2 digits}{month 2 digits}-{seq ≥ 4 digits} (04#R-23), e.g. B6910-0042.
// The caller locks the branch row (booking_seq_month / booking_next_seq) and saves the returned counter.
import { toLocalDate } from "../time/local-time.ts";

const BE_OFFSET = 543;

export function nextBookingNo(input: { now: string; timezone: string; counter: { month: string; nextSeq: number } }): {
  bookingNo: string;
  counter: { month: string; nextSeq: number };
} {
  // month of `now` in the branch's local time (R-20) as BE "YYMM"
  const local = toLocalDate({ instant: input.now, timezone: input.timezone });
  const month = `${String(Number(local.slice(0, 4)) + BE_OFFSET).slice(-2)}${local.slice(5, 7)}`;
  // 2. a new local month restarts at 1; past 9999 the sequence simply grows to 5+ digits
  const seq = input.counter.month === month ? input.counter.nextSeq : 1;
  return { bookingNo: `B${month}-${String(seq).padStart(4, "0")}`, counter: { month, nextSeq: seq + 1 } };
}
