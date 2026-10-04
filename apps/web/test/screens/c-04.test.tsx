import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { BookingsScreen, bookingColumns, countdown, DeclineDialog, tabQueries } from "../../src/components/c-04/bookings-screen";
import messages from "../../src/i18n/messages/th/C-04.json";
import common from "../../src/i18n/messages/th/common.json";

const NOW = Date.parse("2026-10-05T03:00:00.000Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  bookingNo: "B6910-0001",
  status: "awaiting_approval",
  channel: "phone",
  customerId: "00000000-0000-4000-8000-0000000000c1",
  customerName: "มะลิ",
  firstServiceAt: "2026-10-06T03:00:00.000Z",
  modules: ["grooming", "hotel"],
  petNames: ["โมจิ", "ถั่วแดง"],
  estimatedTotalSatang: 150_000,
  depositStatus: "pending",
  depositRequiredSatang: 30_000,
  holdExpiresAt: null,
  approvalDueAt: "2026-10-05T04:30:05.000Z",
  createdAt: "2026-10-05T02:00:00.000Z",
  ...over,
});
const mock = vi.hoisted(() => ({
  params: "",
  lists: {} as Record<string, unknown[]>,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  replace: vi.fn(),
  setState: vi.fn(),
  /** values handed out by the next useState calls instead of their initial values */
  states: [] as unknown[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    mock.states.length ? mock.states.shift() : typeof initial === "function" ? (initial as () => unknown)() : initial,
    mock.setState,
  ],
  useEffect: () => undefined,
  useCallback: <F,>(fn: F) => fn,
}));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => "/console/bookings",
  useSearchParams: () => new URLSearchParams(mock.params),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: { query?: { status?: string } }, options?: { enabled?: boolean }) => {
    mock.query(key, input, options);
    const items = mock.lists[input.query?.status ?? "any"] ?? [];
    return { data: { items, nextCursor: null }, isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.params = "";
  mock.lists = {};
  mock.states = [];
});
const t = (key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]));

it("approval tab (default): every 06 column, the waiting count and approve/decline on each row", () => {
  mock.lists = { awaiting_approval: [row(), row({ id: "00000000-0000-4000-8000-000000000002", bookingNo: "B6910-0002" })] };
  const html = renderToStaticMarkup(<BookingsScreen />);
  for (const key of [
    "title",
    "tabApproval",
    "tabDeposit",
    "tabUpcoming",
    "tabAll",
    "bookingNo",
    "customer",
    "pets",
    "services",
    "firstServiceAt",
    "total",
    "deposit",
    "holdExpires",
    "approvalDue",
    "channel",
    "approve",
    "decline",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain(`${messages.tabApproval} (2)`);
  for (const text of [
    "B6910-0001",
    "มะลิ",
    "โมจิ",
    "ถั่วแดง",
    "✂️",
    "🏨",
    "฿1,500",
    "฿300",
    "โทรศัพท์",
    "/console/bookings/00000000-0000-4000-8000-000000000001",
  ])
    expect(html).toContain(text);
  expect(mock.query).toHaveBeenCalledWith("bookings.list", expect.objectContaining({ query: { status: "awaiting_approval" } }), undefined);
});

it("maps each tab to its bookings.list queries", () => {
  expect(tabQueries("approval", "2026-10-05")).toEqual([{ status: "awaiting_approval" }]);
  expect(tabQueries("deposit", "2026-10-05")).toEqual([
    { status: "awaiting_deposit", limit: 200 },
    { status: "deposit_review", limit: 200 },
  ]);
  expect(tabQueries("upcoming", "2026-10-05")).toEqual([{ status: "confirmed", from: "2026-10-05" }]);
  expect(tabQueries("all", "2026-10-05")).toEqual([{}]);
  expect(tabQueries("all", "2026-10-05", { status: "closed", from: "2026-10-01", to: "2026-10-31" })).toEqual([
    { status: "closed", from: "2026-10-01", to: "2026-10-31" },
  ]);
});

it("deposit tab merges both statuses by start time; all tab shows the status and date filters", () => {
  mock.params = "tab=deposit";
  mock.lists = {
    awaiting_deposit: [
      row({
        id: "00000000-0000-4000-8000-00000000000a",
        bookingNo: "LATER",
        status: "awaiting_deposit",
        firstServiceAt: "2026-10-09T03:00:00.000Z",
      }),
    ],
    deposit_review: [
      row({
        id: "00000000-0000-4000-8000-00000000000b",
        bookingNo: "SOONER",
        status: "deposit_review",
        firstServiceAt: "2026-10-07T03:00:00.000Z",
      }),
    ],
  };
  const html = renderToStaticMarkup(<BookingsScreen />);
  expect(html.indexOf("SOONER")).toBeLessThan(html.indexOf("LATER"));
  expect(html).not.toContain(messages.statusFilter);
  mock.params = "tab=all";
  const all = renderToStaticMarkup(<BookingsScreen />);
  for (const key of ["statusFilter", "anyStatus", "from", "to"] as const) expect(all).toContain(messages[key]);
});

it("switching tabs rewrites the URL and clears the all-tab filters", () => {
  mock.params = "tab=all&status=closed&from=2026-10-01";
  const tabs = BookingsScreen().props.children[1].props.children;
  tabs[2].props.onClick();
  expect(mock.replace).toHaveBeenCalledWith("/console/bookings?tab=upcoming");
});

it("counts down the deposit hold and the approval deadline, red once overdue", () => {
  expect(countdown("2026-10-05T03:05:07.000Z", NOW)).toBe("05:07");
  expect(countdown("2026-10-05T04:30:05.000Z", NOW)).toBe("1:30:05");
  expect(countdown("2026-10-05T02:59:00.000Z", NOW)).toBeNull();
  const actions = { approve: vi.fn(), decline: vi.fn(), busy: false };
  const columns = bookingColumns(t as never, "Asia/Bangkok", NOW, actions);
  const cell = (id: string, r: unknown) => renderToStaticMarkup(columns.find((c) => c.id === id)?.cell(r as never));
  expect(cell("holdExpires", row({ status: "awaiting_deposit", holdExpiresAt: "2026-10-05T03:05:07.000Z" }))).toContain("05:07");
  expect(cell("holdExpires", row())).toBe("");
  expect(cell("approvalDue", row({ approvalDueAt: "2026-10-05T02:00:00.000Z" }))).toContain("text-destructive");
  expect(cell("actions", row({ status: "confirmed" }))).toBe("");
});

it("approve calls bookings.approve; decline opens the reason dialog", async () => {
  const actions = { approve: vi.fn(), decline: vi.fn(), busy: false };
  const buttons = bookingColumns(t as never, "Asia/Bangkok", NOW, actions)
    .find((c) => c.id === "actions")
    ?.cell(row() as never) as { props: { children: { props: { onClick: () => void } }[] } };
  buttons.props.children[0]?.props.onClick();
  expect(actions.approve).toHaveBeenCalledWith(expect.objectContaining({ bookingNo: "B6910-0001" }));
  buttons.props.children[1]?.props.onClick();
  expect(actions.decline).toHaveBeenCalled();

  mock.lists = { awaiting_approval: [row()] };
  const screenColumns = BookingsScreen().props.children[3].props.columns as ReturnType<typeof bookingColumns>;
  const actionsCell = screenColumns.find((c) => c.id === "actions")?.cell(row() as never) as typeof buttons;
  const approveButton = actionsCell.props.children[0];
  await approveButton?.props.onClick();
  expect(mock.mutate).toHaveBeenCalledWith({ params: { bookingId: row().id } });
  expect(mock.mutation).toHaveBeenCalledWith("bookings.approve", expect.objectContaining({ invalidate: ["bookings.list"] }));
});

it("the decline dialog needs a 3–500 character reason before calling onSubmit", async () => {
  const onSubmit = vi.fn();
  const form = (reason: string) => {
    mock.states = [reason, ""];
    return DeclineDialog({ booking: row() as never, pending: false, onCancel: vi.fn(), onSubmit }).props.children.props.children;
  };
  await form("no").props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(mock.setState).toHaveBeenCalledWith(messages.declineInvalid);
  await form("  ช่างไม่ว่างวันนั้น  ").props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenCalledWith("ช่างไม่ว่างวันนั้น");
  const closed = renderToStaticMarkup(<DeclineDialog booking={null} pending={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
  expect(closed).not.toContain(messages.declineReason);
});
