import { BillsReceiptResponse } from "@app/contracts/endpoints/bills.receipt";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ReceiptPage from "../../app/(console)/console/bills/[billId]/receipt/page";
import { printCss, ReceiptScreen, readPaperSize } from "../../src/components/c-20/receipt-screen";
import messages from "../../src/i18n/messages/th/C-20.json";
import common from "../../src/i18n/messages/th/common.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  query: { data: undefined as unknown, isPending: false, error: null as unknown },
  mutation: { isPending: false },
  mutate: vi.fn(),
  refetch: vi.fn(),
  queryKey: "",
  queryInput: {} as Record<string, unknown>,
  mutationKey: "",
  toast: vi.fn(),
  options: {} as { onSuccess?: () => void },
}));
// direct component calls (to reach button handlers) run outside React: plain state, no effects
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: <T,>(initial: T) => [initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const text = ((namespace === "common" ? common : messages) as Record<string, string>)[key] ?? key;
    return values ? text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "") : text;
  },
}));
vi.mock("sonner", () => ({ toast: { success: mock.toast } }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: Record<string, unknown>) => {
    mock.queryKey = key;
    mock.queryInput = input;
    return { ...mock.query, refetch: mock.refetch };
  },
  useApiMutation: (key: string, options: { onSuccess?: () => void }) => {
    mock.mutationKey = key;
    mock.options = options;
    return { ...mock.mutation, mutate: mock.mutate };
  },
}));

const BILL = "10000000-0000-4000-8000-000000000001";
const receipt = BillsReceiptResponse.parse({
  shopName: "Pilot Shop",
  shopAddress: "99/1 ถ.สุขุมวิท กรุงเทพมหานคร",
  shopPhone: "021234567",
  logoUrl: null,
  receiptNo: "R6910-0007",
  closedAt: "2026-10-05T04:00:00.000Z",
  customerName: "สมใจ ใจดี",
  lines: [{ description: "อาบน้ำ", quantity: 2, unitPriceSatang: 45_000, lineDiscountSatang: 0, lineTotalSatang: 90_000 }],
  subtotalSatang: 90_000,
  billDiscountSatang: 10_000,
  totalSatang: 80_000,
  payments: [
    { method: "cash", amountSatang: 50_000 },
    { method: "promptpay", amountSatang: 30_000 },
  ],
  changeSatang: 2_000,
  cashierName: "น้องเอ",
  status: "paid",
  packagesRemaining: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      templateName: "อาบ 5 ครั้ง",
      petId: null,
      petName: null,
      sessionsTotal: 5,
      sessionsUsed: 2,
      sessionsLeft: 3,
      expiresAt: "2027-01-01T16:59:59.999Z",
      status: "active",
      redemptions: [],
    },
  ],
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mock.query = { data: undefined, isPending: false, error: null };
  mock.mutation = { isPending: false };
});
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children)];
}
function click(el: ReactElement<Record<string, unknown>> | undefined) {
  if (!el) throw new Error("missing button");
  (el.props.onClick as () => void)();
}
const render = () => renderToStaticMarkup(<ReceiptScreen billId={BILL} />);

it("renders every 06 field of the receipt from bills.receipt", async () => {
  mock.query.data = receipt;
  const html = renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ billId: BILL }) }));
  expect(mock.queryKey).toBe("bills.receipt");
  expect(mock.queryInput).toEqual({ params: { billId: BILL }, response: BillsReceiptResponse });
  for (const text of [
    "ใบเสร็จรับเงิน",
    "Pilot Shop",
    "99/1 ถ.สุขุมวิท กรุงเทพมหานคร",
    "021234567",
    "เลขที่",
    "R6910-0007",
    "วันที่",
    "5 ต.ค. 2569 11:00 น.",
    "ลูกค้า",
    "สมใจ ใจดี",
    "รายการ",
    "อาบน้ำ",
    "2 × ฿450.00",
    "฿900.00",
    "ส่วนลด",
    "฿100.00",
    "ยอดสุทธิ",
    "฿800.00",
    "ชำระโดย",
    "เงินสด",
    "฿500.00",
    "฿300.00",
    "เงินทอน",
    "฿20.00",
    "แพ็กเกจคงเหลือ",
    "อาบ 5 ครั้ง เหลือ 3 ครั้ง หมดอายุ 1 ม.ค. 2570",
    "ผู้รับเงิน",
    "น้องเอ",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain(messages.void);
});

it("shows the 'ยกเลิก' watermark on a void bill and hides LINE resend", () => {
  mock.query.data = { ...receipt, status: "void" };
  const html = render();
  expect(html).toContain(messages.void);
  expect(html).not.toContain(messages.sendLine);
});

it("shows '—' for an open walk-in bill and no LINE resend without a customer", () => {
  mock.query.data = { ...receipt, status: "open", receiptNo: null, closedAt: null, customerName: null, packagesRemaining: [] };
  const html = render();
  expect(html.split(messages.unavailable).length - 1).toBe(3);
  expect(html).not.toContain(messages.sendLine);
  expect(html).not.toContain(messages.packagesRemaining);
});

it("resends through bills.sendReceipt with the bill id and confirms with a toast", () => {
  mock.query.data = receipt;
  const button = elements(ReceiptScreen({ billId: BILL })).find((n) => n.props.children === messages.sendLine);
  click(button);
  expect(mock.mutationKey).toBe("bills.sendReceipt");
  expect(mock.mutate).toHaveBeenCalledWith({ params: { billId: BILL } });
  mock.options.onSuccess?.();
  expect(mock.toast).toHaveBeenCalledWith(messages.sent);
  mock.mutation.isPending = true;
  expect(render()).toMatch(new RegExp(`disabled=""[^>]*>${messages.sendLine}<`));
});

it("prints with window.print() on the chosen paper size, 80 mm by default", () => {
  mock.query.data = receipt;
  const print = vi.fn();
  vi.stubGlobal("window", { print });
  const button = elements(ReceiptScreen({ billId: BILL })).find((n) => n.props.children === messages.print);
  click(button);
  expect(print).toHaveBeenCalledOnce();
  const html = render();
  for (const label of [messages.paperSize, messages.paper58, messages.paper80, messages.paperA5]) expect(html).toContain(label);
  expect(html).toContain("size: 80mm auto");
  expect(printCss("58")).toContain("size: 58mm auto");
  expect(printCss("A5")).toContain("size: A5");
  vi.stubGlobal("localStorage", { getItem: () => "58" });
  expect(readPaperSize()).toBe("58");
  vi.stubGlobal("localStorage", { getItem: () => "bogus" });
  expect(readPaperSize()).toBe("80");
});

it("shows loading and the API error with retry", () => {
  mock.query.isPending = true;
  expect(render()).toContain('aria-busy="true"');
  mock.query = { data: undefined, isPending: false, error: new ApiClientError("NOT_FOUND", "ไม่พบข้อมูล", 404) };
  const html = render();
  expect(html).toContain("ไม่พบข้อมูล");
  expect(html).toContain(common.retry);
  const retry = elements(ReceiptScreen({ billId: BILL })).find((n) => n.props.children === common.retry);
  click(retry);
  expect(mock.refetch).toHaveBeenCalledOnce();
});
