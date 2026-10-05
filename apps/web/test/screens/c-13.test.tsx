import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canDrop, groups, nextHousekeeping, parseDate, type Unit, zonesOf } from "../../src/components/c-13/logic";
import { RoomGrid, RoomMapScreen } from "../../src/components/c-13/room-map-screen";
import messages from "../../src/i18n/messages/th/C-13.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, params: "" }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/console/hotel",
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
const unit = (over: Partial<Unit> = {}): Unit =>
  ({
    id: id(1),
    code: "A1",
    zone: "ชั้น 1",
    roomTypeName: "ห้องมาตรฐาน",
    status: "active",
    housekeeping: "clean",
    occupant: null,
    arrivingToday: false,
    departingToday: false,
    nextArrivalDate: null,
    ...over,
  }) as Unit;
const occupied = unit({
  id: id(2),
  code: "A2",
  housekeeping: "dirty",
  departingToday: true,
  occupant: { id: id(30), pet: { name: "โมจิ", photoUrl: null, flags: ["bites"] }, checkOutDate: "2026-10-05" } as never,
});
const units = [
  unit(),
  occupied,
  unit({ id: id(3), code: "B1", zone: null, status: "maintenance", arrivingToday: true, nextArrivalDate: "2026-10-09" }),
];

describe("logic", () => {
  it("date, zones, groups, drop targets and housekeeping toggle", () => {
    expect([parseDate("2026-10-07", "2026-10-05"), parseDate("x", "2026-10-05")]).toEqual(["2026-10-07", "2026-10-05"]);
    expect(zonesOf(units)).toEqual(["ชั้น 1", null]);
    expect(groups(units, "ชั้น 1").map((g) => g.units.length)).toEqual([2]);
    expect(groups(units, undefined)).toHaveLength(2);
    expect([canDrop(unit(), id(2)), canDrop(occupied, id(1)), canDrop(units[2] as Unit, id(2)), canDrop(unit(), id(1))]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([nextHousekeeping(unit()), nextHousekeeping(occupied)]).toEqual(["dirty", "clean"]);
  });
});

describe("RoomGrid", () => {
  it("cards: code, type, status (grey when maintenance), housekeeping icon, pet + flags → C-15, checkout / leaving today, arriving today, next arrival", () => {
    const html = renderToStaticMarkup(
      <RoomGrid t={t} units={units} zone={undefined} canMove busy={false} onMove={vi.fn()} onHousekeeping={vi.fn()} />,
    );
    for (const text of [
      "ชั้น 1",
      messages.noZone,
      "A1",
      "ห้องมาตรฐาน",
      "ซ่อม",
      "bg-muted",
      "🧹",
      "✨",
      "โมจิ",
      "กัด",
      'href="/console/stays/00000000-0000-4000-8000-000000000030"',
      messages.checkOut,
      "5 ต.ค. 2569",
      messages.leavingToday,
      messages.arrivingToday,
      messages.nextArrival,
      "9 ต.ค. 2569",
      messages.vacant,
    ])
      expect(html, text).toContain(text);
    expect(html).toContain('draggable="true"');
    expect(
      renderToStaticMarkup(
        <RoomGrid t={t} units={units} zone={undefined} canMove={false} busy={false} onMove={vi.fn()} onHousekeeping={vi.fn()} />,
      ),
    ).not.toContain('draggable="true"');
  });
});

describe("RoomMapScreen", () => {
  it("loads roomMap.get for ?date= and wires changeRoom (own toast for ROOM_TAKEN) / housekeeping", () => {
    mock.params = "date=2026-10-07";
    mock.data = { "auth.me": { staff: { role: "front_desk" } }, "roomMap.get": { date: "2026-10-07", units } };
    const html = renderToStaticMarkup(<RoomMapScreen />);
    expect(html).toContain(messages.zone);
    expect(mock.query).toHaveBeenCalledWith("roomMap.get", expect.objectContaining({ query: { date: "2026-10-07" } }));
    const m = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    expect(m["stays.changeRoom"]).toMatchObject({ meta: { toast: false }, invalidate: expect.arrayContaining(["roomMap.get"]) });
    expect(m["roomUnits.housekeeping"]).toMatchObject({ invalidate: ["roomMap.get"] });
  });
});
