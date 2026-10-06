import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import LiffHomePage from "../../app/(liff)/liff/[branchSlug]/page";
import { HomeScreen, nextBooking, screenHref, todayHours } from "../../src/components/l-02/home-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-02";
import messages from "../../src/i18n/messages/th/L-02.json";

// Tuesday 2026-10-06 10:00 Bangkok
const NOW = new Date("2026-10-06T03:00:00.000Z");
const shop = {
  name: "ร้านน้องหมา",
  hours: [
    { weekday: 2, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
    { weekday: 3, isClosed: true, opensAt: null, closesAt: null },
  ],
  modules: { grooming: true, hotel: false, daycare: true },
};
const booking = (over: Record<string, unknown> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  bookingNo: "B2610-0001",
  status: "awaiting_deposit",
  firstServiceAt: "2026-10-08T03:30:00.000Z",
  petNames: ["โมจิ", "ข้าวปั้น"],
  summary: "อาบน้ำ",
  depositStatus: "pending",
  estimatedTotalSatang: 50_000,
  canCancel: true,
  canReschedule: false,
  ...over,
});
const mock = vi.hoisted(() => ({ data: {} as Record<string, unknown>, pending: false, query: vi.fn() }));
vi.mock("next-intl", () => ({
  useNow: () => NOW,
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never])),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data[key], isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = {};
  mock.pending = false;
});

it("loads liff.shop + upcoming liff.bookings and shows shop name, today's hours, the next booking and the menu", async () => {
  mock.data = { "liff.shop": shop, "liff.bookings": [booking(), booking({ id: "10000000-0000-4000-8000-000000000002" })] };
  const html = renderToStaticMarkup(await LiffHomePage({ params: Promise.resolve({ branchSlug: "shop-a" }) }));
  for (const key of [
    "shopName",
    "todayHours",
    "nextBooking",
    "bookGrooming",
    "bookDaycare",
    "myBookings",
    "myPets",
    "packages",
    "profile",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).not.toContain(messages.bookHotel);
  expect(html).toContain("ร้านน้องหมา");
  expect(html).toContain("เปิด 09:00–18:00");
  expect(html).toContain("โมจิ, ข้าวปั้น");
  expect(html).toContain("รอโอนมัดจำ");
  expect(html).toContain("10:30");
  expect(html).toContain(messages.payDeposit);
  expect(mock.query).toHaveBeenCalledWith("liff.shop", expect.objectContaining({ params: { branchSlug: "shop-a" } }));
  expect(mock.query).toHaveBeenCalledWith("liff.bookings", expect.objectContaining({ query: { scope: "upcoming" } }));
  // implemented screens link, others are disabled
  expect(html).toContain('href="/liff/shop-a/me"');
  expect(entry.implemented).toBe(true);
});

it("no upcoming booking, no deposit due, closed today", () => {
  mock.data = { "liff.shop": { ...shop, hours: [] }, "liff.bookings": [] };
  const html = renderToStaticMarkup(<HomeScreen branchSlug="shop-a" />);
  expect(html).toContain(messages.noBooking);
  expect(html).toContain(messages.closedToday);
  mock.data = { "liff.shop": shop, "liff.bookings": [booking({ status: "confirmed", depositStatus: "verified" })] };
  expect(renderToStaticMarkup(<HomeScreen branchSlug="shop-a" />)).not.toContain(messages.payDeposit);
});

it("loading shows a skeleton", () => {
  mock.pending = true;
  expect(renderToStaticMarkup(<HomeScreen branchSlug="shop-a" />)).toContain('aria-busy="true"');
});

it("helpers: today's weekday in Bangkok, soonest booking, hrefs only for implemented screens", () => {
  expect(todayHours(shop.hours, NOW)).toBe("09:00–18:00");
  expect(todayHours(shop.hours, new Date("2026-10-06T18:00:00.000Z"))).toBeNull(); // already Wednesday in Bangkok
  expect(nextBooking([])).toBeNull();
  expect(screenHref("L-15", "shop a")).toBe("/liff/shop%20a/me");
  expect(screenHref("L-07", "shop-a", { bookingId: "b1" })).toBeNull();
});
