import { describe, expect, it } from "vitest";
import { nextReceiptNo } from "../../../src/ids/receipt-no.ts";

describe("nextReceiptNo (extra cases beyond the vectors)", () => {
  it("keeps the old year just before local midnight on Dec 31", () => {
    const r = nextReceiptNo({
      prefix: "R",
      now: "2026-12-31T16:59:59.999Z",
      timezone: "Asia/Bangkok",
      counter: { yearBe: 2569, nextSeq: 1234 },
    });
    expect(r).toEqual({ receiptNo: "R69-01234", counter: { yearBe: 2569, nextSeq: 1235 } });
  });

  it("grows past 5 digits instead of wrapping", () => {
    const r = nextReceiptNo({
      prefix: "ABC",
      now: "2026-10-05T03:00:00.000Z",
      timezone: "Asia/Bangkok",
      counter: { yearBe: 2569, nextSeq: 100000 },
    });
    expect(r.receiptNo).toBe("ABC69-100000");
  });

  it("issues consecutive numbers without gaps", () => {
    let counter = { yearBe: 2569, nextSeq: 1 };
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = nextReceiptNo({ prefix: "R", now: "2026-10-05T03:00:00.000Z", timezone: "Asia/Bangkok", counter });
      numbers.push(r.receiptNo);
      counter = r.counter;
    }
    expect(numbers).toEqual(["R69-00001", "R69-00002", "R69-00003"]);
  });

  it("uses the branch time zone, not UTC", () => {
    const r = nextReceiptNo({
      prefix: "R",
      now: "2027-01-01T03:00:00.000Z",
      timezone: "America/Los_Angeles",
      counter: { yearBe: 2569, nextSeq: 9 },
    });
    expect(r.receiptNo).toBe("R69-00009");
  });
});
