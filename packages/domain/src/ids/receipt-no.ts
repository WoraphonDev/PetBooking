// R-16 — receipt number {prefix}{BE year 2 digits}-{seq 5 digits} (04#R-16), e.g. R69-00042. Gap-free and unique per branch:
// the caller issues it only when closing a bill, after `SELECT … FROM branch … FOR UPDATE`, and saves the returned counter.
import { toLocalDate } from "../time/local-time.ts";

const BE_OFFSET = 543;

export function nextReceiptNo(input: { prefix: string; now: string; timezone: string; counter: { yearBe: number; nextSeq: number } }): {
  receiptNo: string;
  counter: { yearBe: number; nextSeq: number };
} {
  // 1. local calendar year of the closing time (R-20) + 543; a new year restarts at 1
  const yearBe = Number(toLocalDate({ instant: input.now, timezone: input.timezone }).slice(0, 4)) + BE_OFFSET;
  const seq = input.counter.yearBe === yearBe ? input.counter.nextSeq : 1;
  return { receiptNo: `${input.prefix}${String(yearBe).slice(-2)}-${String(seq).padStart(5, "0")}`, counter: { yearBe, nextSeq: seq + 1 } };
}
