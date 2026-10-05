import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { nightOf, StaysTodayScreen } from "../../src/components/c-14/stays-today-screen";
import messages from "../../src/i18n/messages/th/C-14.json";

const card = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  bookingId: "00000000-0000-4000-8000-0000000000b1",
  bookingNo: "B6910-0001",
  status: "reserved",
  pet: { name: "โมจิ" },
  customerName: "มะลิ",
  roomTypeName: "ห้องเล็ก",
  roomUnitId: "00000000-0000-4000-8000-0000000000a1",
  roomCode: "A1",
  checkInDate: "2026-10-05",
  checkOutDate: "2026-10-08",
  expectedCheckInTime: "10:00",
  expectedCheckOutTime: "16:00",
  nights: 3,
  roomTotalSatang: 180_000,
  inHeat: false,
  bundleAppointmentId: null,
  intakeCompleted: true,
  agreementSigned: false,
  vaccineGate: { ok: false, missing: ["DOG_RABIES"], expired: [], pendingReview: [] },
  ...over,
});
const mock = vi.hoisted(() => ({
  params: "date=2026-10-06",
  lists: {} as Record<string, unknown[]>,
  pending: false,
  query: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as keyof typeof messages])),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mock.params) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: { query: { type: string } }) => {
    mock.query(key, input);
    return { data: mock.lists[input.query.type] ?? [], isPending: mock.pending, isError: false, error: null };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.params = "date=2026-10-06";
  mock.lists = {};
  mock.pending = false;
});

it("loads the three stays.today lists for the date and renders every 06 column with its card fields", () => {
  mock.lists = {
    arrivals: [card({ checkInDate: "2026-10-06" })],
    departures: [card({ id: "00000000-0000-4000-8000-000000000002", status: "checked_in", pet: { name: "ถั่วแดง" }, roomCode: "B2" })],
    in_house: [
      card({
        id: "00000000-0000-4000-8000-000000000003",
        status: "checked_in",
        pet: { name: "ข้าวปั้น" },
        roomCode: "C3",
        checkInDate: "2026-10-05",
      }),
    ],
  };
  const html = renderToStaticMarkup(<StaysTodayScreen />);
  for (const key of [
    "title",
    "arrivals",
    "departures",
    "inHouse",
    "arriveAt",
    "pickUpAt",
    "room",
    "intake",
    "agreement",
    "vaccines",
    "checkIn",
    "checkOut",
  ] as const)
    expect(html).toContain(messages[key]);
  for (const type of ["arrivals", "departures", "in_house"])
    expect(mock.query).toHaveBeenCalledWith("stays.today", expect.objectContaining({ query: { date: "2026-10-06", type } }));
  for (const text of ["โมจิ", "ถั่วแดง", "ข้าวปั้น", "A1", "B2", "C3", "10:00", "16:00", "คืนที่ 2/3", "✓", "✗", "⚠"]) expect(html).toContain(text);
  expect(html).toContain("/console/stays/00000000-0000-4000-8000-000000000001?step=intake");
  expect(html).toContain("/console/stays/00000000-0000-4000-8000-000000000002?step=checkout");
});

it("check-in shows for reserved stays only, check-out for checked-in stays", () => {
  mock.lists = { arrivals: [card({ status: "checked_in" })], departures: [card({ status: "reserved" })] };
  const html = renderToStaticMarkup(<StaysTodayScreen />);
  expect(html).toContain("?step=intake");
  expect(html).not.toContain("?step=checkout");
});

it("defaults to today in the branch timezone when the date is missing or invalid; shows loading and empty states", () => {
  mock.params = "date=nope";
  renderToStaticMarkup(<StaysTodayScreen />);
  const [, input] = mock.query.mock.calls[0] ?? [];
  const asked = (input as { query: { date: string } }).query.date;
  expect(asked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(asked).not.toBe("nope");
  expect(renderToStaticMarkup(<StaysTodayScreen />)).toContain(messages.empty);
  mock.pending = true;
  expect(renderToStaticMarkup(<StaysTodayScreen />)).toContain(messages.loading);
});

it("counts the night of the stay within 1..nights", () => {
  expect(nightOf({ checkInDate: "2026-10-05", nights: 3 }, "2026-10-05")).toBe(1);
  expect(nightOf({ checkInDate: "2026-10-05", nights: 3 }, "2026-10-07")).toBe(3);
  expect(nightOf({ checkInDate: "2026-10-05", nights: 3 }, "2026-10-08")).toBe(3);
});
