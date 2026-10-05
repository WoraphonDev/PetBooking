import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import { BranchSetHoursRequest } from "@app/contracts/endpoints/branch.setHours";
import { ClosuresCreateRequest } from "@app/contracts/endpoints/closures.create";
import type { ClosureItem } from "@app/contracts/endpoints/closures.list";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AffectedList, ClosuresSection, HolidayDialog, HoursScreen, HoursSection } from "../../src/components/c-31/hours-screen";
import {
  closureBody,
  emptyClosure,
  holidayDates,
  hoursRows,
  invalidHours,
  setHoursBody,
  WEEK_ORDER,
} from "../../src/components/c-31/logic";
import messages from "../../src/i18n/messages/th/C-31.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  data: {} as Record<string, unknown>,
}));
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

const t = ((key: string) => String(messages[key as never])) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hours = [
  { weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
  { weekday: 0, isClosed: true, opensAt: null, closesAt: null },
];
const closure = (over: Partial<ClosureItem> = {}): ClosureItem => ({
  id: id(1),
  branchId: id(2),
  startsAt: "2026-10-12T17:00:00.000Z",
  endsAt: "2026-10-13T17:00:00.000Z",
  scope: "grooming",
  source: "public_holiday",
  reason: "วันคล้ายวันสวรรคต",
  createdBy: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("logic", () => {
  it("lays out Monday→Sunday and treats a missing weekday as closed", () => {
    const rows = hoursRows(hours);
    expect(rows.map((r) => r.weekday)).toEqual([...WEEK_ORDER]);
    expect(rows[0]).toEqual({ weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" });
    expect(rows[1]).toEqual({ weekday: 2, isClosed: true, opensAt: null, closesAt: null });
  });

  it("requires ปิด > เปิด on open days and builds a setHours body that passes the contract", () => {
    const rows = hoursRows(hours);
    expect(BranchSetHoursRequest.parse(setHoursBody(rows))).toMatchObject({
      hours: expect.arrayContaining([{ weekday: 2, isClosed: true }]),
    });
    const bad = rows.map((r) => (r.weekday === 1 ? { ...r, closesAt: "08:00" } : r.weekday === 3 ? { ...r, isClosed: false } : r));
    expect(invalidHours(bad)).toEqual([1, 3]);
    expect(setHoursBody(bad)).toBeNull();
  });

  it("converts the local start/end to UTC, requires สิ้นสุด > เริ่ม and trims the reason", () => {
    const form = {
      ...emptyClosure(),
      startDate: "2026-10-13",
      startTime: "00:00",
      endDate: "2026-10-13",
      endTime: "12:00",
      reason: " ซ่อมไฟ ",
    };
    const { body } = closureBody(form, "Asia/Bangkok");
    expect(body).toEqual({ startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-13T05:00:00.000Z", scope: "all", reason: "ซ่อมไฟ" });
    expect(ClosuresCreateRequest.parse(body)).toBeTruthy();
    expect(closureBody({ ...form, endTime: "00:00" }, "Asia/Bangkok")).toEqual({ body: null, errors: { end: true } });
    expect(closureBody(emptyClosure(), "Asia/Bangkok").errors).toEqual({ start: true, end: true });
    expect(closureBody({ ...form, scope: null, reason: "" }, "Asia/Bangkok").errors).toEqual({ scope: true });
  });

  it("keeps the picked holiday dates of that year, once, in order", () => {
    expect(holidayDates(2026, ["2026-12-31", "2026-10-13", "2027-01-01", "2026-10-13"])).toEqual(["2026-10-13", "2026-12-31"]);
  });
});

describe("C-31 sections", () => {
  it("hours: every weekday row with closed toggle, open/close selects (30 min) and the owner's save button", () => {
    const html = renderToStaticMarkup(
      <HoursSection t={t} rows={hoursRows(hours)} onChange={vi.fn()} editable invalid={[1]} saving={false} onSave={vi.fn()} />,
    );
    for (const label of [
      messages.sectionHours,
      messages.weekday,
      messages.closedAllDay,
      messages.opensAt,
      messages.closesAt,
      messages.saveHours,
      messages.closesAfterOpens,
      "จ.",
      "อ.",
      "พ.",
      "พฤ.",
      "ศ.",
      "ส.",
      "อา.",
    ])
      expect(html, label).toContain(label);
    expect(html).toContain('value="09:30"');
    expect(html).not.toContain('value="09:15"');
  });

  it("hours are read-only without the save button for front desk", () => {
    const html = renderToStaticMarkup(
      <HoursSection t={t} rows={hoursRows(hours)} onChange={vi.fn()} editable={false} invalid={[]} saving={false} onSave={vi.fn()} />,
    );
    expect(html).not.toContain(messages.saveHours);
    expect(html).toMatch(/<select[^>]*disabled=""/);
  });

  it("closures: list with range, scope, reason, source and delete; the add form; holiday import for the owner", () => {
    const props = {
      t,
      deleteLabel: common.delete,
      items: [closure(), closure({ id: id(3), source: "manual", scope: "all", reason: null })],
      timezone: "Asia/Bangkok",
      form: emptyClosure(),
      onForm: vi.fn(),
      errors: { end: true as const },
      adding: false,
      onAdd: vi.fn(),
      deleting: false,
      onDelete: vi.fn(),
      onImport: vi.fn(),
    };
    const html = renderToStaticMarkup(<ClosuresSection {...props} canImport />);
    for (const label of [
      messages.list,
      messages.colRange,
      messages.colScope,
      messages.colReason,
      messages.colSource,
      "13 ต.ค. 2569 00:00 น. – 14 ต.ค. 2569 00:00 น.",
      "กรูม",
      "ทั้งร้าน",
      "วันคล้ายวันสวรรคต",
      messages.sourcePublicHoliday,
      messages.sourceManual,
      common.delete,
      messages.start,
      messages.end,
      messages.endAfterStart,
      messages.scope,
      messages.reason,
      messages.addClosure,
      messages.importHolidays,
    ])
      expect(html, label).toContain(label);
    expect(renderToStaticMarkup(<ClosuresSection {...props} canImport={false} />)).not.toContain(messages.importHolidays);
  });

  it("affected dialog lists the bookings hit by the change", () => {
    const items: AffectedServiceItem[] = [
      {
        module: "grooming",
        bookingId: id(5),
        bookingNo: "B6910-0001",
        itemId: id(6),
        petName: "โมจิ",
        customerName: "มะลิ",
        startsAt: "2026-10-13T03:00:00.000Z",
        date: "2026-10-13",
      },
      {
        module: "hotel",
        bookingId: id(7),
        bookingNo: "B6910-0002",
        itemId: id(8),
        petName: "ถั่ว",
        customerName: "ส้ม",
        startsAt: null,
        date: "2026-10-13",
      },
    ];
    const html = renderToStaticMarkup(<AffectedList t={t} items={items} timezone="Asia/Bangkok" />);
    for (const label of [
      messages.affectedBooking,
      messages.affectedPet,
      messages.affectedCustomer,
      messages.affectedWhen,
      "B6910-0001",
      "โมจิ",
      "มะลิ",
    ])
      expect(html, label).toContain(label);
    expect(html).toContain("กรูม · 13 ต.ค. 2569 10:00 น.");
    expect(html).toContain("โรงแรม · 13 ต.ค. 2569");
    expect(renderToStaticMarkup(<AffectedList t={t} items={[]} timezone="Asia/Bangkok" />)).toContain(messages.affectedNone);
  });
});

describe("HoursScreen", () => {
  it("loads branch.get + closures.list (+ auth.me for the owner rows) and wires every button to its endpoint", () => {
    mock.data = {
      "auth.me": { staff: { role: "owner" } },
      "branch.get": { hours },
      "closures.list": [closure()],
    };
    const html = renderToStaticMarkup(<HoursScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain(messages.saveHours);
    expect(html).toContain(messages.importHolidays);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["auth.me", "branch.get", "closures.list"]));
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    expect(mutations["branch.setHours"]).toMatchObject({ invalidate: ["branch.get"] });
    expect(mutations["closures.create"]).toMatchObject({ invalidate: ["closures.list"] });
    expect(mutations["closures.delete"]).toMatchObject({ invalidate: ["closures.list"] });
    expect(mutations["closures.importHolidays"]).toMatchObject({ invalidate: ["closures.list"] });
  });

  it("front desk sees no save-hours or holiday-import button", () => {
    mock.data = { "auth.me": { staff: { role: "front_desk" } }, "branch.get": { hours }, "closures.list": [] };
    const html = renderToStaticMarkup(<HoursScreen />);
    expect(html).not.toContain(messages.saveHours);
    expect(html).not.toContain(messages.importHolidays);
    expect(html).toContain(messages.addClosure);
  });

  it("holiday dialog renders closed until opened", () => {
    const html = renderToStaticMarkup(
      <HolidayDialog
        t={t}
        open={false}
        defaultYear={2026}
        busy={false}
        cancelLabel={common.cancel}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toBe("");
  });
});
