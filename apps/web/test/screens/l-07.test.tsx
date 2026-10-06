import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import PayDepositPage from "../../app/(liff)/liff/[branchSlug]/bookings/[bookingId]/pay/page";
import { canSendSlip, isExpired, PayScreen, PayView, screenPath } from "../../src/components/l-07/pay-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-07";
import messages from "../../src/i18n/messages/th/L-07.json";

const NOW = Date.parse("2026-10-07T03:00:00.000Z");
const BOOKING_ID = "10000000-0000-4000-8000-000000000001";
const detail = (over: { status?: string; expiresAt?: string | null; payment?: null } = {}) => ({
  booking: {
    id: BOOKING_ID,
    bookingNo: "B2610-0007",
    status: over.status ?? "awaiting_deposit",
    firstServiceAt: "2026-10-09T03:00:00.000Z",
    petNames: ["โมจิ"],
    summary: "อาบน้ำ",
    depositStatus: "pending",
    estimatedTotalSatang: 50_000,
    canCancel: true,
    canReschedule: true,
  },
  groom: [],
  stays: [],
  daycare: [],
  payment:
    over.payment === null
      ? null
      : {
          amountSatang: 15_000,
          promptpayPayload: "00020101021229370016A000000677010111011300668123456785802TH530376454031506304ABCD",
          accountName: "ร้านน้องหมา",
          promptpayIdMasked: "678",
          expiresAt: over.expiresAt === undefined ? "2026-10-07T03:10:00.000Z" : over.expiresAt,
        },
  policySnapshot: {},
  cancelPreview: null,
  rescheduleBlockedReason: null,
  shopPhone: null,
  mapUrl: null,
  icsUrl: "/x.ics",
});
const mock = vi.hoisted(() => ({
  data: undefined as unknown,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  replace: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [mock.states.length ? mock.states.shift() : initial, mock.setState],
  useRef: (initial: unknown) => ({ current: initial ?? null }),
}));
vi.mock("next-intl", () => ({
  useNow: () => new Date(NOW),
  useTranslations: (ns: string) => (key: string) => (ns === "common" ? key : String(messages[key as never])),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mock.replace }) }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
/** every element in a JSX tree (function components are not expanded) */
function elements(node: unknown): { props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as { props: Record<string, unknown> };
  return [el, ...elements(el.props.children)];
}
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
  mock.pending = false;
  mock.states = [];
});

it("loads liff.booking and shows every L-07 field: amount, QR 240px + save, account name, countdown, slip upload", async () => {
  mock.data = detail();
  const html = renderToStaticMarkup(await PayDepositPage({ params: Promise.resolve({ branchSlug: "shop-a", bookingId: BOOKING_ID }) }));
  for (const key of [
    "amount",
    "qr",
    "saveQr",
    "accountName",
    "checkName",
    "timeLeft",
    "sectionSlip",
    "slip",
    "pickSlip",
    "sendSlip",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("฿150");
  expect(html).toContain('width="240"');
  expect(html).toContain("ร้านน้องหมา");
  expect(html).toContain('role="timer"');
  expect(mock.query).toHaveBeenCalledWith(
    "liff.booking",
    expect.objectContaining({ params: { branchSlug: "shop-a", bookingId: BOOKING_ID } }),
  );
  expect(entry.implemented).toBe(true);
});

it("ส่งสลิป sends liff.uploadSlip with the file and the slip QR, then goes to the booking", async () => {
  // useState order in PayView: expired, slip
  mock.states = [false, { fileId: "10000000-0000-4000-8000-0000000000f1", qrPayload: "QRDATA" }];
  mock.mutate.mockResolvedValue({});
  const view = PayView({ detail: detail() as never, branchSlug: "shop-a", bookingId: BOOKING_ID });
  const button = elements(view).find((e) => e.props.children === messages.sendSlip && typeof e.props.onClick === "function");
  if (!button) throw new Error("send button not rendered");
  await (button.props.onClick as () => Promise<void>)();
  expect(mock.mutation).toHaveBeenCalledWith("liff.uploadSlip", expect.objectContaining({ invalidate: ["liff.booking", "liff.bookings"] }));
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a", bookingId: BOOKING_ID },
    body: { fileId: "10000000-0000-4000-8000-0000000000f1", qrPayload: "QRDATA" },
  });
  expect(mock.toast.success).toHaveBeenCalledWith(messages.slipSent);
  expect(mock.replace).toHaveBeenCalledWith("/liff/shop-a/bookings"); // L-09 not built yet → L-08
});

it("HOLD_EXPIRED from the server switches to the time-up page", async () => {
  const { ApiClientError } = await import("../../src/lib/api");
  mock.states = [false, { fileId: "10000000-0000-4000-8000-0000000000f1", qrPayload: null }];
  mock.mutate.mockRejectedValue(new ApiClientError("HOLD_EXPIRED", "หมดเวลา", 409));
  const view = PayView({ detail: detail() as never, branchSlug: "shop-a", bookingId: BOOKING_ID });
  const button = elements(view).find((e) => e.props.children === messages.sendSlip && typeof e.props.onClick === "function");
  if (!button) throw new Error("send button not rendered");
  await (button.props.onClick as () => Promise<void>)();
  expect(mock.setState).toHaveBeenCalledWith(true);
  expect(mock.mutate).toHaveBeenCalledWith(expect.objectContaining({ body: { fileId: "10000000-0000-4000-8000-0000000000f1" } }));
});

it("time up or expired booking → หมดเวลา page with จองใหม่; nothing due → link to my bookings", () => {
  mock.data = detail({ expiresAt: "2026-10-07T02:59:00.000Z" });
  const expired = renderToStaticMarkup(<PayScreen branchSlug="shop-a" bookingId={BOOKING_ID} />);
  expect(expired).toContain(messages.expiredTitle);
  expect(expired).toContain('href="/liff/shop-a"');
  expect(expired).not.toContain(messages.sendSlip);
  mock.data = detail({ status: "expired" });
  expect(renderToStaticMarkup(<PayScreen branchSlug="shop-a" bookingId={BOOKING_ID} />)).toContain(messages.expiredTitle);
  mock.data = detail({ status: "deposit_review", payment: null });
  const none = renderToStaticMarkup(<PayScreen branchSlug="shop-a" bookingId={BOOKING_ID} />);
  expect(none).toContain(messages.nothingDue);
  expect(none).toContain('href="/liff/shop-a/bookings"');
});

it("helpers: send only while awaiting_deposit before the hold ends; screen paths", () => {
  expect(canSendSlip(detail() as never, NOW)).toBe(true);
  expect(canSendSlip(detail({ expiresAt: "2026-10-07T03:00:00.000Z" }) as never, NOW)).toBe(false);
  expect(canSendSlip(detail({ status: "deposit_review" }) as never, NOW)).toBe(false);
  expect(isExpired(detail({ expiresAt: "2026-10-07T03:00:00.000Z" }) as never, NOW)).toBe(true);
  expect(screenPath("L-09", "shop a", BOOKING_ID, "/fallback")).toBe("/fallback");
  expect(screenPath("L-08", "shop-a", BOOKING_ID)).toBe("/liff/shop-a/bookings");
});
