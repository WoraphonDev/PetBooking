import type { StaffUserItem } from "@app/contracts/dto/staff-user-item";
import { StaffUsersInviteRequest } from "@app/contracts/endpoints/staffUsers.invite";
import { StaffUsersUpdateRequest } from "@app/contracts/endpoints/staffUsers.update";
import { TimeOffCreateRequest } from "@app/contracts/endpoints/timeOff.create";
import type { TimeOffItem } from "@app/contracts/endpoints/timeOff.list";
import { WorkingHoursSetRequest } from "@app/contracts/endpoints/workingHours.set";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayRows,
  editBody,
  emptyInvite,
  emptyTimeOff,
  fullItems,
  invalidDays,
  inviteBody,
  lineShareUrl,
  timeAgo,
  timeOffBody,
  timeOffRange,
  toggleStatus,
  workingHoursBody,
} from "../../src/components/c-36/logic";
import { AffectedList, HoursEditor, TimeOffSection } from "../../src/components/c-36/schedule";
import { HoursTable, InviteSection, StaffList, StaffScreen } from "../../src/components/c-36/staff-screen";
import messages from "../../src/i18n/messages/th/C-36.json";
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
const person = (over: Partial<StaffUserItem> = {}): StaffUserItem => ({
  id: id(1),
  displayName: "ดาว",
  email: "dao@shop.test",
  phone: null,
  role: "staff",
  isGroomer: true,
  status: "active",
  sortOrder: 1,
  photoUrl: null,
  lineLinked: true,
  lastLoginAt: "2026-10-05T01:00:00.000Z",
  workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00", breakEndsAt: "13:00" }],
  ...over,
});

describe("logic", () => {
  it("time ago buckets and full items only", () => {
    expect([
      timeAgo("2026-10-05T02:59:40.000Z", NOW),
      timeAgo("2026-10-05T02:15:00.000Z", NOW),
      timeAgo("2026-10-05T01:00:00.000Z", NOW),
      timeAgo("2026-10-02T03:00:00.000Z", NOW),
    ]).toEqual([
      { key: "justNow", n: 0 },
      { key: "minutesAgo", n: 45 },
      { key: "hoursAgo", n: 2 },
      { key: "daysAgo", n: 3 },
    ]);
    expect(fullItems([person(), { id: id(2), displayName: "x", isGroomer: false, photoUrl: null }])).toHaveLength(1);
  });

  it("invite: name required, optional email checked by the API's zod rule", () => {
    expect(inviteBody(emptyInvite()).errors).toEqual({ displayName: true });
    expect(inviteBody({ ...emptyInvite(), displayName: "ฟ้า", email: "not-an-email" }).errors).toEqual({ email: true });
    const { body } = inviteBody({ displayName: " ฟ้า ", email: " Fah@Shop.test ", role: "front_desk", isGroomer: false });
    expect(StaffUsersInviteRequest.parse(body)).toEqual({
      displayName: "ฟ้า",
      email: "fah@shop.test",
      role: "front_desk",
      isGroomer: false,
    });
    expect(inviteBody({ ...emptyInvite(), displayName: "ฟ้า" }).body).not.toHaveProperty("email");
  });

  it("edit sends only changes; disable/enable toggles; invited has no toggle", () => {
    expect(editBody(person(), { displayName: "ดาว", role: "staff", isGroomer: true })).toBeNull();
    expect(StaffUsersUpdateRequest.parse(editBody(person(), { displayName: "ดาวใหม่", role: "front_desk", isGroomer: true }))).toEqual({
      displayName: "ดาวใหม่",
      role: "front_desk",
    });
    expect([toggleStatus(person()), toggleStatus(person({ status: "disabled" })), toggleStatus(person({ status: "invited" }))]).toEqual([
      { status: "disabled" },
      { status: "active" },
      null,
    ]);
    expect(lineShareUrl("https://x.test/invite/a b")).toBe("https://line.me/R/share?text=https%3A%2F%2Fx.test%2Finvite%2Fa%20b");
  });

  it("working hours: 7 rows Mon→Sun, เลิก > เริ่ม, break inside the day, days off left out of the body", () => {
    const rows = dayRows(person().workingHours);
    expect(rows.map((r) => [r.weekday, r.on])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
      [0, false],
    ]);
    expect(WorkingHoursSetRequest.parse(workingHoursBody(rows))).toEqual({
      days: [{ weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00", breakEndsAt: "13:00" }],
    });
    const set = (weekday: number, next: object) => rows.map((r) => (r.weekday === weekday ? { ...r, ...next } : r));
    expect(invalidDays(set(1, { endsAt: "08:00" }))).toEqual([1]);
    expect(invalidDays(set(1, { breakEndsAt: null }))).toEqual([1]);
    expect(invalidDays(set(1, { breakStartsAt: "17:30", breakEndsAt: "18:30" }))).toEqual([1]);
    expect(workingHoursBody(set(1, { endsAt: "08:00" }))).toBeNull();
    // a day without a break, Tuesday switched on with the default times
    expect(
      workingHoursBody(set(2, { on: true }).map((r) => (r.weekday === 1 ? { ...r, breakStartsAt: null, breakEndsAt: null } : r))),
    ).toEqual({
      days: [
        { weekday: 1, startsAt: "09:00", endsAt: "18:00" },
        { weekday: 2, startsAt: "09:00", endsAt: "18:00" },
      ],
    });
  });

  it("time off: staff + range required, ends after starts, branch-local → UTC; list range a year from today", () => {
    expect(timeOffBody(emptyTimeOff(), "Asia/Bangkok").errors).toEqual({ staffUserId: true, start: true, end: true });
    const form = { ...emptyTimeOff(), staffUserId: id(1), startDate: "2026-10-10", endDate: "2026-10-10", reason: " ลาป่วย " };
    expect(timeOffBody({ ...form, startTime: "12:00", endTime: "09:00" }, "Asia/Bangkok").errors).toEqual({ end: true });
    const { body } = timeOffBody({ ...form, startTime: "09:00", endTime: "18:00" }, "Asia/Bangkok");
    expect(TimeOffCreateRequest.parse(body)).toEqual({
      staffUserId: id(1),
      startsAt: "2026-10-10T02:00:00.000Z",
      endsAt: "2026-10-10T11:00:00.000Z",
      reason: "ลาป่วย",
    });
    expect(timeOffRange("2026-10-05")).toEqual({ from: "2026-10-05", to: "2027-10-05" });
  });
});

describe("sections", () => {
  it("list: name, role, groomer ✓, status badge, LINE icon, last login; owner buttons by status", () => {
    const html = renderToStaticMarkup(
      <StaffList
        t={t}
        staff={[
          person(),
          person({
            id: id(2),
            displayName: "ฟ้า",
            status: "invited",
            lineLinked: false,
            lastLoginAt: null,
            isGroomer: false,
            role: "front_desk",
          }),
        ]}
        now={NOW}
        isOwner
        busy={false}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
        onResend={vi.fn()}
      />,
    );
    for (const text of [
      messages.name,
      messages.role,
      messages.isGroomer,
      messages.status,
      messages.line,
      messages.lastLogin,
      "ดาว",
      "พนักงาน/ช่าง",
      "หน้าร้าน",
      "✓",
      "ใช้งาน",
      "รอรับคำเชิญ",
      messages.lineLinked,
      messages.lineNotLinked,
      "2 ชั่วโมงที่แล้ว",
      messages.never,
      messages.edit,
      messages.disable,
      messages.resend,
    ])
      expect(html, text).toContain(text);
    const desk = renderToStaticMarkup(
      <StaffList t={t} staff={[person()]} now={NOW} isOwner={false} busy={false} onEdit={vi.fn()} onToggle={vi.fn()} onResend={vi.fn()} />,
    );
    expect(desk).not.toContain(messages.edit);
  });

  it("invite: nickname, email (optional), role radio with permission text, groomer toggle", () => {
    const html = renderToStaticMarkup(<InviteSection t={t} busy={false} onInvite={vi.fn()} />);
    for (const text of [
      messages.sectionInvite,
      messages.displayName,
      messages.email,
      messages.emailHint,
      messages.role,
      "เจ้าของร้าน",
      messages.roleOwner,
      messages.roleFrontDesk,
      messages.roleStaff,
      messages.groomerToggle,
      messages.invite,
    ])
      expect(html, text).toContain(text);
  });

  it("weekly hours: Mon→Sun with times, break and day off", () => {
    const html = renderToStaticMarkup(<HoursTable t={t} staff={[person()]} onEdit={vi.fn()} />);
    for (const text of [messages.sectionHours, "จ.", "อา.", "09:00–18:00", "พัก 12:00–13:00", messages.dayOff, messages.editHours])
      expect(html, text).toContain(text);
  });

  it("hours editor: วันทำงาน toggle, เริ่ม / เลิก / พัก per day and บันทึกตารางงาน", () => {
    const html = renderToStaticMarkup(
      <HoursEditor t={t} staff={person()} busy={false} cancelLabel={common.cancel} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    for (const text of [
      messages.workday,
      messages.startsAt,
      messages.endsAt,
      messages.break,
      `${messages.workday} จ.`,
      `${messages.breakStartsAt} จ.`,
      `${messages.breakEndsAt} อา.`,
      messages.saveHours,
    ])
      expect(html, text).toContain(text);
  });

  it("time off: รายการ (ช่วงเวลา + เหตุผล) with ลบวันลา, ช่วงลา, เหตุผล, เพิ่มวันลา", () => {
    const item: TimeOffItem = {
      id: id(90),
      organizationId: id(91),
      staffUserId: id(1),
      startsAt: "2026-10-10T02:00:00.000Z",
      endsAt: "2026-10-10T11:00:00.000Z",
      reason: "ลาป่วย",
      createdBy: null,
      createdAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(
      <TimeOffSection
        t={t}
        staff={[person()]}
        items={[item]}
        timezone="Asia/Bangkok"
        form={emptyTimeOff()}
        onForm={vi.fn()}
        errors={{ end: true }}
        adding={false}
        deleting={false}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    for (const text of [
      messages.sectionTimeOff,
      messages.timeOffList,
      "ดาว",
      "10 ต.ค. 2569 09:00 น. – 10 ต.ค. 2569 18:00 น.",
      "ลาป่วย",
      messages.deleteTimeOff,
      messages.timeOffStaff,
      messages.timeOffRange,
      messages.reason,
      messages.endAfterStart,
      messages.addTimeOff,
    ])
      expect(html, text).toContain(text);
    expect(
      renderToStaticMarkup(
        <TimeOffSection
          {...{
            t,
            staff: [],
            items: [],
            timezone: "Asia/Bangkok",
            form: emptyTimeOff(),
            onForm: vi.fn(),
            errors: {},
            adding: false,
            deleting: false,
            onAdd: vi.fn(),
            onDelete: vi.fn(),
          }}
        />,
      ),
    ).toContain(messages.noTimeOff);
  });

  it("affected appointments after เพิ่มวันลา", () => {
    const html = renderToStaticMarkup(
      <AffectedList
        t={t}
        timezone="Asia/Bangkok"
        items={[
          {
            module: "grooming",
            bookingId: id(80),
            bookingNo: "B6910-0001",
            itemId: id(81),
            petName: "โมจิ",
            customerName: "มะลิ",
            startsAt: "2026-10-10T03:00:00.000Z",
            date: "2026-10-10",
          },
        ]}
      />,
    );
    for (const text of [messages.affectedHint, messages.affectedBooking, "B6910-0001", "โมจิ", "มะลิ", "10 ต.ค. 2569 10:00 น."])
      expect(html, text).toContain(text);
    expect(renderToStaticMarkup(<AffectedList t={t} timezone="Asia/Bangkok" items={[]} />)).toContain(messages.affectedNone);
  });
});

describe("StaffScreen", () => {
  it("loads staffUsers.list + timeOff.list and wires invite / update / resendInvite / workingHours.set / timeOff.* (owner sees the invite form)", () => {
    mock.data = { "auth.me": { staff: { role: "owner" } }, "staffUsers.list": [person()], "timeOff.list": [] };
    const html = renderToStaticMarkup(<StaffScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain(messages.sectionInvite);
    expect(html).toContain(messages.sectionTimeOff);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["auth.me", "staffUsers.list", "timeOff.list"]);
    expect(mock.query.mock.calls[2]?.[1]).toMatchObject({ query: { from: expect.any(String), to: expect.any(String) } });
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    expect(Object.keys(mutations).sort()).toEqual([
      "staffUsers.invite",
      "staffUsers.resendInvite",
      "staffUsers.update",
      "timeOff.create",
      "timeOff.delete",
      "workingHours.set",
    ]);
    expect(mutations["workingHours.set"]).toMatchObject({ invalidate: ["staffUsers.list"] });
    expect(mutations["timeOff.create"]).toMatchObject({ invalidate: ["timeOff.list"] });
    expect(mutations["timeOff.delete"]).toMatchObject({ invalidate: ["timeOff.list"] });
  });

  it("front desk: no invite form", () => {
    mock.data = { "auth.me": { staff: { role: "front_desk" } }, "staffUsers.list": [person()] };
    expect(renderToStaticMarkup(<StaffScreen />)).not.toContain(messages.sectionInvite);
  });
});
