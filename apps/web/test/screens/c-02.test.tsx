import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import { CalendarDay } from "@app/contracts/dto/calendar-day";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppointmentBlock, CalendarScreen, DayGrid, SidePanel, Toolbar, WeekView } from "../../src/components/c-02/calendar-screen";
import { addDays, box, canDrag, depositSettled, parseQuery, slotInstant, timeRows } from "../../src/components/c-02/logic";
import messages from "../../src/i18n/messages/th/C-02.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, params: "" }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/console/calendar",
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

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const appt = (over: Partial<AppointmentCard> = {}): AppointmentCard => ({
  id: id(1),
  bookingId: id(2),
  bookingNo: "B6910-0001",
  status: "scheduled",
  startsAt: "2026-10-05T03:00:00.000Z", // 10:00 Bangkok
  endsAt: "2026-10-05T04:00:00.000Z",
  blockedUntil: "2026-10-05T04:15:00.000Z",
  groomerId: id(10),
  groomerName: "พี่ดาว",
  groomerPreference: "any",
  stationId: id(20),
  stationName: "โต๊ะ 1",
  pet: {
    id: id(30),
    name: "โมจิ",
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    coatType: "curly",
    latestWeightGrams: 5000,
    status: "active",
    photoUrl: null,
    flags: ["bites"],
    ageMonths: 24,
    vaccineStatus: "ok",
  },
  customerName: "มะลิ",
  customerPhone: "+66812345678",
  items: [{ serviceId: id(40), name: "อาบน้ำ", isAddon: false, priceSatang: 45_000, durationMinutes: 60, customerPackageId: null }],
  surcharges: [],
  servicesTotalSatang: 45_000,
  surchargeTotalSatang: 0,
  depositStatus: "pending",
  reliabilityLevel: 1,
  fromStayId: null,
  checkedInAt: null,
  startedAt: null,
  doneAt: null,
  pickedUpAt: null,
  staffNote: null,
  ...over,
});
const day = (over: Partial<CalendarDay> = {}): CalendarDay =>
  CalendarDay.parse({
    date: "2026-10-05",
    opensAt: "09:00",
    closesAt: "18:00",
    groomers: [
      {
        id: id(10),
        displayName: "พี่ดาว",
        workingHours: { weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00", breakEndsAt: "13:00" },
        timeOff: [
          {
            id: id(50),
            organizationId: id(60),
            staffUserId: id(10),
            startsAt: "2026-10-05T08:00:00.000Z",
            endsAt: "2026-10-05T09:00:00.000Z",
            reason: "หมอฟัน",
            createdBy: null,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
    ],
    stations: [{ id: id(20), name: "โต๊ะ 1" }],
    closures: [
      {
        id: id(70),
        branchId: id(80),
        startsAt: "2026-10-05T09:00:00.000Z",
        endsAt: "2026-10-05T11:00:00.000Z",
        scope: "all",
        source: "manual",
        reason: "ซ่อมไฟ",
        createdBy: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    appointments: [appt()],
    hotel: { arrivals: 2, departures: 1, inHouse: 4 },
    daycare: { count: 3 },
    pendingApprovals: 0,
    pendingSlips: 0,
    ...over,
  });

describe("logic", () => {
  it("reads date/view from the query with safe fallbacks", () => {
    expect(parseQuery(new URLSearchParams("date=2026-10-07&view=week"), "2026-10-05")).toEqual({ date: "2026-10-07", view: "week" });
    expect(parseQuery(new URLSearchParams("date=bad&view=month"), "2026-10-05")).toEqual({ date: "2026-10-05", view: "day" });
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("builds the Y axis from opening hours every slot_step; a closed day has none", () => {
    expect(timeRows(day(), 30)).toHaveLength(18);
    expect(timeRows(day(), 30).slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
    expect(timeRows(day({ opensAt: null, closesAt: null }), 30)).toEqual([]);
  });

  it("positions intervals by local time, clipped to the open hours", () => {
    expect(box("2026-10-05T03:00:00.000Z", "2026-10-05T04:00:00.000Z", day(), "Asia/Bangkok")).toEqual({ top: 96, height: 96 });
    expect(box("2026-10-05T01:00:00.000Z", "2026-10-05T02:30:00.000Z", day(), "Asia/Bangkok")).toEqual({ top: 0, height: 48 });
    expect(box("2026-10-05T12:00:00.000Z", "2026-10-05T13:00:00.000Z", day(), "Asia/Bangkok")).toBeNull();
    expect(slotInstant("2026-10-05", "10:30", "Asia/Bangkok")).toBe("2026-10-05T03:30:00.000Z");
  });

  it("only owner / front desk drag scheduled cards; deposit ✓ when settled", () => {
    expect([canDrag(appt(), true), canDrag(appt(), false), canDrag(appt({ status: "checked_in" }), true)]).toEqual([true, false, false]);
    expect([depositSettled("verified"), depositSettled("not_required"), depositSettled("pending")]).toEqual([true, true, false]);
  });
});

describe("C-02 parts", () => {
  it("toolbar: date picker with today/←/→, day/week, groomer select (ทุกคน)", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        t={t}
        date="2026-10-05"
        view="day"
        today="2026-10-05"
        onDate={vi.fn()}
        onView={vi.fn()}
        groomers={day().groomers}
        groomerId={null}
        onGroomer={vi.fn()}
      />,
    );
    for (const label of [
      messages.date,
      messages.today,
      messages.prev,
      messages.next,
      messages.view,
      messages.viewDay,
      messages.viewWeek,
      messages.groomer,
      messages.allGroomers,
      "พี่ดาว",
    ])
      expect(html, label).toContain(label);
  });

  it("appointment card: time–time, pet (bold) + flag icon, breed, services, deposit, reliability dot, station, phone", () => {
    const html = renderToStaticMarkup(<AppointmentBlock t={t} a={appt()} timezone="Asia/Bangkok" draggable />);
    for (const text of [
      "10:00 น.–11:00 น.",
      "โมจิ",
      "🦷",
      'aria-label="กัด"',
      "พุดเดิ้ล",
      "อาบน้ำ",
      messages.depositPending,
      "ระดับ 1",
      "โต๊ะ 1",
      "081-234-5678",
      "นัดไว้",
    ])
      expect(html, text).toContain(text);
    expect(html).toContain('draggable="true"');
    expect(html).toContain('href="/console/bookings/00000000-0000-4000-8000-000000000002"');
    // role staff gets customerPhone null from calendar.day → no phone, no dot for level 3
    const staffView = renderToStaticMarkup(
      <AppointmentBlock t={t} a={appt({ customerPhone: null, reliabilityLevel: 3, depositStatus: "verified" })} timezone="Asia/Bangkok" />,
    );
    expect(staffView).not.toContain("081-234-5678");
    expect(staffView).not.toContain("ระดับ 3");
    expect(staffView).toContain("✓");
  });

  it("day grid: groomer columns, time axis, closure band with reason, time-off band, buffer, empty-slot buttons for OF", () => {
    const html = renderToStaticMarkup(
      <DayGrid t={t} day={day()} slotStep={30} timezone="Asia/Bangkok" canEdit onDrop={vi.fn()} onEmpty={vi.fn()} />,
    );
    for (const text of ["พี่ดาว", "09:00", "17:30", "ซ่อมไฟ", "หมอฟัน", 'data-field="buffer"', "จองใหม่ 10:00"])
      expect(html, text).toContain(text);
    const readOnly = renderToStaticMarkup(
      <DayGrid t={t} day={day()} slotStep={30} timezone="Asia/Bangkok" canEdit={false} onDrop={vi.fn()} onEmpty={vi.fn()} />,
    );
    expect(readOnly).not.toContain('draggable="true"');
    expect(readOnly).toMatch(/aria-label="จองใหม่ 09:00" disabled=""/);
    expect(
      renderToStaticMarkup(
        <DayGrid
          t={t}
          day={day({ opensAt: null, closesAt: null })}
          slotStep={30}
          timezone="Asia/Bangkok"
          canEdit
          onDrop={vi.fn()}
          onEmpty={vi.fn()}
        />,
      ),
    ).toContain(messages.closedDay);
  });

  it("side panel: hotel today (in/out/staying), daycare, groomer breaks and time off", () => {
    const html = renderToStaticMarkup(<SidePanel t={t} day={day()} timezone="Asia/Bangkok" />);
    for (const text of [
      messages.hotelToday,
      "เข้า 2 · ออก 1 · พัก 4",
      messages.daycare,
      ">3<",
      messages.timeOff,
      "พี่ดาว · พัก 12:00–13:00",
      "15:00 น.–16:00 น. · หมอฟัน",
    ])
      expect(html, text).toContain(text);
  });

  it("week view: 7 days with their appointments and closed days", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      day({ date: addDays("2026-10-05", i), appointments: i === 0 ? [appt()] : [], ...(i === 1 ? { opensAt: null, closesAt: null } : {}) }),
    );
    const html = renderToStaticMarkup(<WeekView t={t} days={days} timezone="Asia/Bangkok" onOpenDay={vi.fn()} />);
    expect(html).toContain("5 ต.ค. 2569");
    expect(html).toContain("11 ต.ค. 2569");
    expect(html).toContain("โมจิ");
    expect(html).toContain(messages.closedDay);
    expect(html).toContain(messages.noAppointments);
  });
});

describe("CalendarScreen", () => {
  it("loads calendar.day for the query date/view and wires drag-to-reschedule to groom.reschedule", () => {
    mock.params = "date=2026-10-05&view=day";
    mock.data = { "auth.me": { staff: { role: "owner" } }, "branch.get": { policy: { slotStepMinutes: 30 } }, "calendar.day": day() };
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain('draggable="true"');
    expect(mock.query).toHaveBeenCalledWith("calendar.day", expect.objectContaining({ query: { date: "2026-10-05", view: "day" } }));
    expect(mock.mutation).toHaveBeenCalledWith(
      "groom.reschedule",
      expect.objectContaining({ invalidate: ["calendar.day", "bookings.get", "dashboard.today"], meta: { toast: false } }),
    );
  });

  it("role staff: read-only (no dragging)", () => {
    mock.data = { "auth.me": { staff: { role: "staff" } }, "branch.get": { policy: { slotStepMinutes: 30 } }, "calendar.day": day() };
    expect(renderToStaticMarkup(<CalendarScreen />)).not.toContain('draggable="true"');
  });
});
