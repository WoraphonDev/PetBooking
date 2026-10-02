// R-15 — bill totals, discounts and payments (04#R-15). Receipts only (no VAT in MVP). Integer satang only.
// Discount reasons, the front_desk 20% limit, audit, auto deposit payment and STALE_BILL (steps 2, 4, 6) are service concerns.

const isAmount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

export function computeBillTotals(input: {
  lines: { quantity: number; unitPriceSatang: number; lineDiscountSatang: number }[];
  billDiscountSatang: number;
  payments: { method: string; amountSatang: number; status: "posted" | "voided" }[];
}):
  | { subtotalSatang: number; totalSatang: number; paidSatang: number; dueSatang: number; canClose: boolean }
  | { error: "LINE_DISCOUNT_TOO_LARGE" | "INVALID_QUANTITY" | "BILL_DISCOUNT_TOO_LARGE" } {
  // 1. line total = qty × unit − line discount; a discount above the line amount is an error
  let subtotalSatang = 0;
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) return { error: "INVALID_QUANTITY" };
    const gross = line.quantity * line.unitPriceSatang;
    if (line.lineDiscountSatang > gross) return { error: "LINE_DISCOUNT_TOO_LARGE" };
    subtotalSatang += gross - line.lineDiscountSatang;
  }
  // 2. bill discount ≤ subtotal
  if (input.billDiscountSatang > subtotalSatang) return { error: "BILL_DISCOUNT_TOO_LARGE" };
  const totalSatang = subtotalSatang - input.billDiscountSatang;
  // 3. only posted payments count; the bill closes when nothing is due
  const paidSatang = input.payments.filter((p) => p.status === "posted").reduce((sum, p) => sum + p.amountSatang, 0);
  const dueSatang = totalSatang - paidSatang;
  return { subtotalSatang, totalSatang, paidSatang, dueSatang, canClose: dueSatang === 0 };
}

export function applyPayment(input: {
  dueSatang: number;
  method: "cash" | "promptpay" | "bank_transfer" | "card_edc" | "deposit" | "credit";
  tenderedSatang?: number;
  amountSatang?: number;
  creditBalanceSatang?: number;
}):
  | { amountSatang: number; changeSatang: number; dueAfterSatang: number }
  | { error: "BILL_ALREADY_PAID" | "INVALID_AMOUNT" | "AMOUNT_EXCEEDS_DUE" | "INSUFFICIENT_CREDIT" } {
  const due = input.dueSatang;
  if (due <= 0) return { error: "BILL_ALREADY_PAID" };

  // 5. cash: take at most what is due and give change for the rest
  if (input.method === "cash") {
    const tendered = input.tenderedSatang;
    if (!isAmount(tendered) || tendered <= 0) return { error: "INVALID_AMOUNT" };
    const amountSatang = Math.min(tendered, due);
    return { amountSatang, changeSatang: tendered - amountSatang, dueAfterSatang: due - amountSatang };
  }
  // other methods: the exact amount, never above what is due; credit also within the customer's balance
  const amount = input.amountSatang;
  if (!isAmount(amount) || amount <= 0) return { error: "INVALID_AMOUNT" };
  if (amount > due) return { error: "AMOUNT_EXCEEDS_DUE" };
  if (input.method === "credit" && amount > (input.creditBalanceSatang ?? 0)) return { error: "INSUFFICIENT_CREDIT" };
  return { amountSatang: amount, changeSatang: 0, dueAfterSatang: due - amount };
}
