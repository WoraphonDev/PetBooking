import type { BillListItem } from "@app/contracts/dto/bill-list-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { BillListScreen } from "../../src/components/c-19/bill-list-screen";
import messages from "../../src/i18n/messages/th/C-19.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  rows: [
    {
      id: "b1",
      receiptNo: null,
      status: "open",
      customerName: "มิก",
      totalSatang: 12345,
      paidSatang: 2000,
      openedAt: "2026-10-02T18:30:00Z",
      closedAt: null,
      methods: ["cash", "promptpay"],
    },
  ] as BillListItem[],
  params: "status=paid&date=2026-10-03",
  loading: false,
  failed: false,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  reset: vi.fn(),
  message: vi.fn(),
  effect: vi.fn(),
  filters: { status: "paid", date: "2026-10-03" } as { status?: string; date?: string },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial, mock.message],
  useEffect: (callback: () => void) => mock.effect(callback),
  useRef: (initial: unknown) => ({ current: initial && typeof initial === "object" && "status" in initial ? mock.filters : initial }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => (namespace === "common" ? common : messages)[key as never],
  useTimeZone: () => "Asia/Bangkok",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }), useSearchParams: () => new URLSearchParams(mock.params) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: { items: mock.rows, nextCursor: "next" }, isPending: mock.loading, isError: mock.failed, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: mock.pending };
  },
}));
vi.mock("../../src/components/shared/table/cursor", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/table/cursor")>()),
  useCursorPagination: () => ({ cursor: null, hasPrevious: false, next: mock.next, previous: mock.previous, reset: mock.reset }),
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.mutate.mockReset();
  mock.params = "status=paid&date=2026-10-03";
  mock.loading = false;
  mock.failed = false;
  mock.pending = false;
});
it("renders every column with server money, payment icons, status and opened time", () => {
  const html = renderToStaticMarkup(<BillListScreen />);
  for (const key of ["title", "receipt", "customer", "total", "paid", "methods", "status", "time", "open"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["มิก", "฿123.45", "฿20", "01:30", 'aria-label="เงินสด"', 'aria-label="PromptPay"']) expect(html).toContain(text);
  expect(html).toContain('href="/console/bills/b1"');
});
it("uses closed time when present and handles nullable customer and receipt", () => {
  const previous = mock.rows;
  mock.rows = [
    { ...(previous[0] as BillListItem), customerName: null, status: "paid", receiptNo: "R-001", closedAt: "2026-10-02T20:00:00Z" },
  ];
  const html = renderToStaticMarkup(<BillListScreen />);
  expect(html).toContain("R-001");
  expect(html).toContain("03:00");
  mock.rows = previous;
});
it("uses the URL status/date and API cursor contract", () => {
  BillListScreen();
  expect(mock.query).toHaveBeenCalledWith(
    "bills.list",
    expect.objectContaining({ query: { status: "paid", date: "2026-10-03", cursor: undefined, limit: 50 } }),
    { enabled: true },
  );
});
it("blocks malformed URL filters and does not invent a default date", () => {
  mock.params = "status=bad&date=invalid";
  const html = renderToStaticMarkup(<BillListScreen />);
  expect(html).toContain(messages.invalidFilter);
  expect(mock.query).toHaveBeenLastCalledWith("bills.list", expect.anything(), { enabled: false });
  mock.params = "";
  BillListScreen();
  expect(mock.query).toHaveBeenLastCalledWith(
    "bills.list",
    expect.objectContaining({ query: { status: undefined, date: undefined, cursor: undefined, limit: 50 } }),
    { enabled: true },
  );
});
it("opens a walk-in sale without a customer and navigates to the returned bill", async () => {
  mock.mutate.mockResolvedValue({ id: "new-bill" });
  await BillListScreen().props.children[0].props.children[1].props.onClick();
  expect(mock.mutate).toHaveBeenCalledWith({ body: {} });
  expect(mock.push).toHaveBeenCalledWith("/console/bills/new-bill");
  expect(mock.mutation).toHaveBeenCalledWith("bills.open", expect.objectContaining({ invalidate: ["bills.list"] }));
});
it("prevents double opening and stays on the list when opening fails", async () => {
  const button = () => BillListScreen().props.children[0].props.children[1];
  mock.pending = true;
  await button().props.onClick();
  expect(mock.mutate).not.toHaveBeenCalled();
  mock.pending = false;
  mock.mutate.mockRejectedValue(new Error("failure"));
  await button().props.onClick();
  expect(mock.push).not.toHaveBeenCalled();
  expect(mock.message).toHaveBeenCalledWith(expect.any(String));
});
it("delegates cursor navigation and supports loading/error/empty states", () => {
  const table = BillListScreen().props.children[2];
  table.props.pagination.onNext("next");
  expect(mock.next).toHaveBeenCalledWith("next");
  table.props.pagination.onPrevious();
  expect(mock.previous).toHaveBeenCalled();
  mock.loading = true;
  expect(renderToStaticMarkup(<BillListScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<BillListScreen />)).toContain('role="alert"');
  mock.failed = false;
  const previous = mock.rows;
  mock.rows = [];
  expect(renderToStaticMarkup(<BillListScreen />)).toContain(common.empty);
  mock.rows = previous;
});
it("enables the bill list menu", async () => {
  const { entry } = await import("../../src/components/shell-console/navigation/C-19");
  expect(entry.implemented).toBe(true);
});

it("resets cursor history when the URL filters change, without resetting an unchanged view", () => {
  BillListScreen();
  mock.effect.mock.calls.at(-1)?.[0]();
  expect(mock.reset).not.toHaveBeenCalled();
  mock.params = "status=open&date=2026-10-04";
  BillListScreen();
  mock.effect.mock.calls.at(-1)?.[0]();
  expect(mock.reset).toHaveBeenCalledOnce();
});
