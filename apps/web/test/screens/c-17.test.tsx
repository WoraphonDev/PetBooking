import type { DaycareVisitItem } from "@app/contracts/dto/daycare-visit-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionsFor, DaycareScreen, parseDate, VisitTable } from "../../src/components/c-17/daycare-screen";
import messages from "../../src/i18n/messages/th/C-17.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, params: "" }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/console/daycare",
  useSearchParams: () => new URLSearchParams(mock.params),
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
  mock.params = "";
});

const t = ((key: string) => String(messages[key as never])) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const visit = (over: Partial<DaycareVisitItem> = {}): DaycareVisitItem =>
  ({
    id: id(1),
    bookingId: id(2),
    pet: { id: id(3), name: "โมจิ", photoUrl: null, flags: ["anxious"], vaccineStatus: "ok" },
    sessionName: "เต็มวัน",
    visitDate: "2026-10-05",
    priceSatang: 25_000,
    status: "reserved",
    checkedInAt: null,
    checkedOutAt: null,
    ...over,
  }) as DaycareVisitItem;

describe("logic", () => {
  it("buttons by status and the date query", () => {
    expect([actionsFor("reserved"), actionsFor("checked_in"), actionsFor("checked_out")]).toEqual([
      ["checkIn", "noShow", "cancel"],
      ["checkOut"],
      [],
    ]);
    expect([parseDate("2026-10-07", "2026-10-05"), parseDate(null, "2026-10-05")]).toEqual(["2026-10-07", "2026-10-05"]);
  });
});

describe("VisitTable", () => {
  it("pet (+ flags), session, status, in/out times, R-11 mark, buttons per status", () => {
    const html = renderToStaticMarkup(
      <VisitTable
        t={t}
        visits={[
          visit(),
          visit({
            id: id(4),
            status: "checked_in",
            checkedInAt: "2026-10-05T02:00:00.000Z",
            pet: { id: id(5), name: "ถั่ว", photoUrl: null, flags: [], vaccineStatus: "warning" } as never,
          }),
        ]}
        timezone="Asia/Bangkok"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    for (const text of [
      messages.pet,
      messages.session,
      messages.status,
      messages.inOut,
      messages.vaccine,
      "โมจิ",
      "ขี้กังวล",
      "เต็มวัน",
      "จองแล้ว",
      "09:00 น. / —",
      "✓",
      "⚠",
      messages.checkIn,
      messages.noShow,
      messages.cancel,
      messages.checkOut,
    ])
      expect(html, text).toContain(text);
    expect(renderToStaticMarkup(<VisitTable t={t} visits={[]} timezone="Asia/Bangkok" busy={false} onAction={vi.fn()} />)).toContain(
      messages.empty,
    );
  });
});

describe("DaycareScreen", () => {
  it("loads daycare.list for ?date= and wires the four actions", () => {
    mock.params = "date=2026-10-07";
    mock.data = { "daycare.list": [visit()] };
    expect(renderToStaticMarkup(<DaycareScreen />)).toContain("โมจิ");
    expect(mock.query).toHaveBeenCalledWith("daycare.list", expect.objectContaining({ query: { date: "2026-10-07" } }));
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual([
      "daycare.check_in",
      "daycare.check_out",
      "daycare.no_show",
      "daycare.cancel",
    ]);
  });
});
