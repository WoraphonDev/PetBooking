import type { StaffUserItem } from "@app/contracts/dto/staff-user-item";
import { StaffUsersInviteRequest } from "@app/contracts/endpoints/staffUsers.invite";
import { StaffUsersUpdateRequest } from "@app/contracts/endpoints/staffUsers.update";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editBody, emptyInvite, fullItems, inviteBody, lineShareUrl, timeAgo, toggleStatus } from "../../src/components/c-36/logic";
import { HoursTable, InviteSection, StaffList, StaffScreen } from "../../src/components/c-36/staff-screen";
import messages from "../../src/i18n/messages/th/C-36.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
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
    const html = renderToStaticMarkup(<HoursTable t={t} staff={[person()]} />);
    for (const text of [messages.sectionHours, "จ.", "อา.", "09:00–18:00", "พัก 12:00–13:00", messages.dayOff])
      expect(html, text).toContain(text);
  });
});

describe("StaffScreen", () => {
  it("loads staffUsers.list and wires invite / update / resendInvite (owner sees the invite form)", () => {
    mock.data = { "auth.me": { staff: { role: "owner" } }, "staffUsers.list": [person()] };
    const html = renderToStaticMarkup(<StaffScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain(messages.sectionInvite);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["auth.me", "staffUsers.list"]);
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual(["staffUsers.invite", "staffUsers.update", "staffUsers.resendInvite"]);
  });

  it("front desk: no invite form", () => {
    mock.data = { "auth.me": { staff: { role: "front_desk" } }, "staffUsers.list": [person()] };
    expect(renderToStaticMarkup(<StaffScreen />)).not.toContain(messages.sectionInvite);
  });
});
