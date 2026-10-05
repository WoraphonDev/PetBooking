import type { SlipItem } from "@app/contracts/dto/slip-item";
import { SlipsVerifyRequest } from "@app/contracts/endpoints/slips.verify";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canApprove, canReview, oldestFirst, timeAgo, verifyBody } from "../../src/components/c-07/logic";
import { SlipCard, SlipsScreen } from "../../src/components/c-07/slips-screen";
import messages from "../../src/i18n/messages/th/C-07.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data[key], isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = {};
});

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.parse("2026-10-05T03:00:00.000Z");
const slip = (over: Partial<SlipItem> = {}): SlipItem => ({
  id: id(1),
  bookingId: id(2),
  bookingNo: "B6910-0001",
  billId: null,
  customerName: "มะลิ",
  imageUrl: "https://s.test/slip.jpg",
  amountExpectedSatang: 30_000,
  transRef: "TX0001",
  isDuplicate: false,
  duplicateOfSlipId: null,
  status: "submitted",
  uploadedAt: "2026-10-05T02:15:00.000Z",
  reviewedAt: null,
  rejectReason: null,
  holdExpiresAt: "2026-10-05T05:00:00.000Z",
  ...over,
});

describe("logic", () => {
  it("orders oldest first, shows buttons for submitted slips only and builds the verify body", () => {
    const list = [slip({ id: id(3), uploadedAt: "2026-10-05T02:30:00.000Z" }), slip()];
    expect(oldestFirst(list).map((s) => s.id)).toEqual([id(1), id(3)]);
    expect([canReview(slip()), canReview(slip({ status: "verified" }))]).toEqual([true, false]);
    expect([canApprove(slip()), canApprove(slip({ bookingId: null, billId: id(9) }))]).toEqual([true, false]);
    expect([
      verifyBody(null, { approveBooking: false, confirmDuplicate: false }),
      verifyBody(0, { approveBooking: false, confirmDuplicate: false }),
    ]).toEqual([null, null]);
    expect(SlipsVerifyRequest.parse(verifyBody(25_000, { approveBooking: true, confirmDuplicate: true }))).toEqual({
      amountSatang: 25_000,
      confirmDuplicate: true,
      approveBooking: true,
    });
    expect(timeAgo("2026-10-05T02:15:00.000Z", NOW)).toEqual({ key: "minutesAgo", n: 45 });
  });
});

describe("SlipCard", () => {
  const render = (s: SlipItem) =>
    renderToStaticMarkup(
      <SlipCard t={t} slip={s} now={NOW} timezone="Asia/Bangkok" busy={false} onZoom={vi.fn()} onVerify={vi.fn()} onReject={vi.fn()} />,
    );

  it("shows every 06 row and the buttons of a submitted slip", () => {
    const html = render(slip({ isDuplicate: true, duplicateOfSlipId: id(7) }));
    for (const text of [
      messages.enlarge,
      "https://s.test/slip.jpg",
      messages.booking,
      'href="/console/bookings/00000000-0000-4000-8000-000000000002"',
      "B6910-0001",
      messages.customer,
      "มะลิ",
      messages.amountExpected,
      "฿300",
      messages.transRef,
      "TX0001",
      messages.duplicate,
      messages.usedBefore,
      'href="#slip-00000000-0000-4000-8000-000000000007"',
      messages.uploadedAt,
      "45 นาทีที่แล้ว",
      messages.holdUntil,
      "5 ต.ค. 2569 12:00 น.",
      messages.amountReceived,
      'value="300"',
      messages.verify,
      messages.verifyApprove,
      messages.reject,
    ])
      expect(html, text).toContain(text);
  });

  it("'-' when the QR could not be read; no hold row, duplicate badge or buttons when not applicable", () => {
    const html = render(slip({ transRef: null, holdExpiresAt: null, status: "verified" }));
    expect(html).toContain(">-<");
    for (const text of [messages.holdUntil, messages.usedBefore, messages.verify, messages.reject]) expect(html, text).not.toContain(text);
  });
});

describe("SlipsScreen", () => {
  it("loads slips.list (submitted) and wires slips.verify / slips.reject with list + booking invalidation", () => {
    mock.data = { "slips.list": [slip()] };
    const html = renderToStaticMarkup(<SlipsScreen />);
    expect(html).toContain(messages.title);
    expect(mock.query).toHaveBeenCalledWith("slips.list", expect.objectContaining({ query: { status: "submitted" } }));
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    for (const key of ["slips.verify", "slips.reject"])
      expect(mutations[key], key).toMatchObject({ invalidate: expect.arrayContaining(["slips.list", "bookings.get"]) });
  });

  it("empty list", () => {
    mock.data = { "slips.list": [] };
    expect(renderToStaticMarkup(<SlipsScreen />)).toContain(messages.empty);
  });
});
