import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import MyBookingsPage from "../../app/(liff)/liff/[branchSlug]/bookings/page";
import { BookingsScreen, depositDue, screenHref } from "../../src/components/l-08/bookings-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-08";
import { entry as l09 } from "../../src/components/shell-liff/navigation/L-09";
import messages from "../../src/i18n/messages/th/L-08.json";

const booking = (over: Record<string, unknown> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  bookingNo: "B2610-0001",
  status: "awaiting_deposit",
  firstServiceAt: "2026-10-08T03:30:00.000Z",
  petNames: ["โมจิ", "ข้าวปั้น"],
  summary: "อาบน้ำ, ห้องเล็ก",
  depositStatus: "pending",
  estimatedTotalSatang: 50_000,
  canCancel: true,
  canReschedule: false,
  ...over,
});
const mock = vi.hoisted(() => ({ data: [] as unknown[], pending: false, query: vi.fn(), scope: "upcoming", setState: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [mock.scope, mock.setState],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => String(messages[key as never]) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = [];
  mock.pending = false;
  mock.scope = "upcoming";
});

it("loads upcoming liff.bookings and shows every L-08 card field with Thai labels", async () => {
  mock.data = [booking()];
  const html = renderToStaticMarkup(await MyBookingsPage({ params: Promise.resolve({ branchSlug: "shop-a" }) }));
  for (const key of ["upcoming", "past", "dateTime", "pets", "services", "status", "deposit", "bookingNo", "payDeposit"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["10:30", "โมจิ", "ข้าวปั้น", "อาบน้ำ, ห้องเล็ก", "รอโอนมัดจำ", "ค้างมัดจำ", "B2610-0001"]) expect(html).toContain(text);
  expect(mock.query).toHaveBeenCalledWith(
    "liff.bookings",
    expect.objectContaining({ params: { branchSlug: "shop-a" }, query: { scope: "upcoming" } }),
  );
  expect(entry.implemented).toBe(true);
});

it("the past tab asks liff.bookings for scope=past; a settled deposit has no pay button", () => {
  mock.scope = "past";
  mock.data = [booking({ status: "closed", depositStatus: "applied" })];
  const html = renderToStaticMarkup(<BookingsScreen branchSlug="shop-a" />);
  expect(mock.query).toHaveBeenCalledWith("liff.bookings", expect.objectContaining({ query: { scope: "past" } }));
  expect(html).toContain("เสร็จสิ้น");
  expect(html).not.toContain(messages.payDeposit);
});

it("empty list and loading states", () => {
  expect(renderToStaticMarkup(<BookingsScreen branchSlug="shop-a" />)).toContain(messages.empty);
  mock.pending = true;
  expect(renderToStaticMarkup(<BookingsScreen branchSlug="shop-a" />)).toContain('aria-busy="true"');
});

it("helpers: deposit due for pending/rejected; links only once L-07 / L-09 exist", () => {
  expect(depositDue(booking() as never)).toBe(true);
  expect(depositDue(booking({ depositStatus: "rejected" }) as never)).toBe(true);
  expect(depositDue(booking({ depositStatus: "submitted" }) as never)).toBe(false);
  // follows the live entry: null until L-09 ships, then its route
  expect(screenHref("L-09", "shop-a", "b1")).toBe(l09.implemented ? "/liff/shop-a/bookings/b1" : null);
});
