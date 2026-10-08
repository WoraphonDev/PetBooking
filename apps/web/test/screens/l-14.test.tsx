import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import PayBalancePage from "../../app/(liff)/liff/[branchSlug]/pay/[billId]/page";
import { BalanceView, PayBalanceScreen } from "../../src/components/l-14/pay-balance-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-14";
import messages from "../../src/i18n/messages/th/L-14.json";
import { ApiClientError } from "../../src/lib/api";

const BILL_ID = "10000000-0000-4000-8000-0000000000b1";
const payment = (amountSatang = 125_000) => ({
  amountSatang,
  promptpayPayload: "00020101021229370016A000000677010111011300668123456785802TH530376454071250.006304ABCD",
  accountName: "ร้านน้องหมา",
  promptpayIdMasked: "678",
  expiresAt: null,
});
const mock = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as unknown,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [mock.states.length ? mock.states.shift() : initial, mock.setState],
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => (ns === "common" ? key : String(messages[key as never])),
}));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: mock.error !== null, error: mock.error, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
function elements(node: unknown): { props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as { props: Record<string, unknown> };
  return [el, ...elements(el.props.children)];
}
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
  mock.error = null;
  mock.pending = false;
  mock.states = [];
});

it("loads liff.payPage and shows every L-14 field: balance, QR, account name, slip upload", async () => {
  mock.data = payment();
  const html = renderToStaticMarkup(await PayBalancePage({ params: Promise.resolve({ branchSlug: "shop-a", billId: BILL_ID }) }));
  for (const key of ["balance", "qr", "accountName", "sectionSlip", "slip", "pickSlip", "sendSlip"] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("฿1,250");
  expect(html).toContain("ร้านน้องหมา");
  expect(html).toContain('data-slot="promptpay-qr"');
  expect(mock.query).toHaveBeenCalledWith("liff.payPage", expect.objectContaining({ params: { branchSlug: "shop-a", billId: BILL_ID } }));
  expect(entry.implemented).toBe(true);
});

it("ส่งสลิป calls liff.payUploadSlip with the file and the slip QR, then shows the waiting message", async () => {
  // useState order in BalanceView: slip, sent
  mock.states = [{ fileId: "10000000-0000-4000-8000-0000000000f1", qrPayload: "QR" }, false];
  mock.mutate.mockResolvedValue(payment());
  const view = BalanceView({ payment: payment(), branchSlug: "shop-a", billId: BILL_ID });
  const button = elements(view).find((e) => e.props.children === messages.sendSlip && typeof e.props.onClick === "function");
  if (!button) throw new Error("send button not rendered");
  await (button.props.onClick as () => Promise<void>)();
  expect(mock.mutation).toHaveBeenCalledWith("liff.payUploadSlip", expect.objectContaining({ invalidate: ["liff.payPage"] }));
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a", billId: BILL_ID },
    body: { fileId: "10000000-0000-4000-8000-0000000000f1", qrPayload: "QR" },
  });
  expect(mock.setState).toHaveBeenCalledWith(true);
  mock.states = [null, true];
  expect(renderToStaticMarkup(<BalanceView payment={payment()} branchSlug="shop-a" billId={BILL_ID} />)).toContain(messages.waiting);
});

it("nothing due (0, or a closed bill → BILL_NOT_OPEN) hides the slip upload", () => {
  const zero = renderToStaticMarkup(<BalanceView payment={payment(0)} branchSlug="shop-a" billId={BILL_ID} />);
  expect(zero).toContain(messages.nothingDue);
  expect(zero).not.toContain(messages.pickSlip);
  mock.error = new ApiClientError("BILL_NOT_OPEN", "บิลปิดแล้ว", 409);
  expect(renderToStaticMarkup(<PayBalanceScreen branchSlug="shop-a" billId={BILL_ID} />)).toContain(messages.nothingDue);
});

it("loading and other errors", () => {
  mock.pending = true;
  expect(renderToStaticMarkup(<PayBalanceScreen branchSlug="shop-a" billId={BILL_ID} />)).toContain('aria-busy="true"');
  mock.pending = false;
  mock.error = new ApiClientError("NOT_FOUND", "ไม่พบข้อมูล", 404);
  const html = renderToStaticMarkup(<PayBalanceScreen branchSlug="shop-a" billId={BILL_ID} />);
  expect(html).toContain("ไม่พบข้อมูล");
  expect(html).toContain(messages.retry);
});
