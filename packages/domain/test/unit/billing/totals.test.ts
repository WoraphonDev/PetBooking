import { describe, expect, it } from "vitest";
import { applyPayment, computeBillTotals } from "../../../src/billing/totals.ts";

const line = (quantity: number, unitPriceSatang: number, lineDiscountSatang = 0) => ({ quantity, unitPriceSatang, lineDiscountSatang });

describe("computeBillTotals (extra cases beyond the vectors)", () => {
  it("rejects zero, negative or fractional quantities", () => {
    for (const q of [0, -1, 1.5])
      expect(computeBillTotals({ lines: [line(q, 100)], billDiscountSatang: 0, payments: [] })).toEqual({ error: "INVALID_QUANTITY" });
  });

  it("allows a discount equal to the line or the subtotal (free bill closes immediately)", () => {
    expect(computeBillTotals({ lines: [line(2, 500, 1000)], billDiscountSatang: 0, payments: [] })).toEqual({
      subtotalSatang: 0,
      totalSatang: 0,
      paidSatang: 0,
      dueSatang: 0,
      canClose: true,
    });
    expect(computeBillTotals({ lines: [line(1, 1000)], billDiscountSatang: 1000, payments: [] })).toMatchObject({
      totalSatang: 0,
      canClose: true,
    });
  });

  it("does not close an overpaid bill (negative due)", () => {
    expect(
      computeBillTotals({
        lines: [line(1, 1000)],
        billDiscountSatang: 0,
        payments: [{ method: "cash", amountSatang: 1200, status: "posted" }],
      }),
    ).toMatchObject({
      dueSatang: -200,
      canClose: false,
    });
  });

  it("treats an empty bill as total 0", () => {
    expect(computeBillTotals({ lines: [], billDiscountSatang: 0, payments: [] })).toMatchObject({ totalSatang: 0, canClose: true });
  });
});

describe("applyPayment (extra cases beyond the vectors)", () => {
  it("rejects a missing, zero, negative or fractional amount", () => {
    expect(applyPayment({ dueSatang: 100, method: "cash" })).toEqual({ error: "INVALID_AMOUNT" });
    expect(applyPayment({ dueSatang: 100, method: "cash", tenderedSatang: 0 })).toEqual({ error: "INVALID_AMOUNT" });
    expect(applyPayment({ dueSatang: 100, method: "card_edc" })).toEqual({ error: "INVALID_AMOUNT" });
    expect(applyPayment({ dueSatang: 100, method: "promptpay", amountSatang: -5 })).toEqual({ error: "INVALID_AMOUNT" });
    expect(applyPayment({ dueSatang: 100, method: "promptpay", amountSatang: 10.5 })).toEqual({ error: "INVALID_AMOUNT" });
  });

  it("checks the due amount before the credit balance and allows credit within both", () => {
    expect(applyPayment({ dueSatang: 100, method: "credit", amountSatang: 200, creditBalanceSatang: 50 })).toEqual({
      error: "AMOUNT_EXCEEDS_DUE",
    });
    expect(applyPayment({ dueSatang: 100, method: "credit", amountSatang: 50, creditBalanceSatang: 50 })).toEqual({
      amountSatang: 50,
      changeSatang: 0,
      dueAfterSatang: 50,
    });
    expect(applyPayment({ dueSatang: 100, method: "credit", amountSatang: 1 })).toEqual({ error: "INSUFFICIENT_CREDIT" });
  });

  it("caps a deposit payment like any non-cash method", () => {
    expect(applyPayment({ dueSatang: 100, method: "deposit", amountSatang: 101 })).toEqual({ error: "AMOUNT_EXCEEDS_DUE" });
  });

  it("reports an already paid bill before anything else", () => {
    expect(applyPayment({ dueSatang: -50, method: "credit" })).toEqual({ error: "BILL_ALREADY_PAID" });
  });
});
