import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CustomerScreen, debounceCustomerSearch } from "../../src/components/c-08/customer-screen";
import messages from "../../src/i18n/messages/th/C-08.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  rows: [
    {
      id: "c1",
      firstName: "มิก",
      lastName: null,
      nickname: "มิกกี้",
      phone: "+66812345678",
      pets: [{ id: "p1", name: "ลัคกี้", species: "dog" }],
      reliabilityLevel: 3,
      blacklisted: false,
      lastVisitAt: "2026-10-02T18:00:00Z",
      visitCount: 4,
      creditBalanceSatang: 12345,
      lineLinked: true,
    },
  ] as CustomerListItem[],
  q: "",
  loading: false,
  failed: false,
  query: vi.fn(),
  state: vi.fn(),
  reset: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  push: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial === "" ? mock.q : initial, mock.state],
  useEffect: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => (namespace === "common" ? common : messages)[key as never],
  useTimeZone: () => "Asia/Bangkok",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return {
      data: { items: mock.rows, nextCursor: "page2" },
      isPending: mock.loading,
      isError: mock.failed,
      error: null,
      refetch: mock.refetch,
    };
  },
}));
vi.mock("../../src/components/shared/table/cursor", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/table/cursor")>()),
  useCursorPagination: () => ({ cursor: null, hasPrevious: false, next: mock.next, previous: mock.previous, reset: mock.reset }),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mock.q = "";
  mock.loading = false;
  mock.failed = false;
});
it("renders all fields, Thai date/phone/money, pet chip and linked LINE indicator", () => {
  const html = renderToStaticMarkup(<CustomerScreen />);
  for (const key of ["title", "search", "sort", "name", "phone", "pets", "lastVisit", "visits", "level", "credit", "line", "add"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["มิก", "มิกกี้", "ลัคกี้", "081-234-5678", "3 ต.ค. 2569", "฿123.45"]) expect(html).toContain(text);
});
it("hides zero credit and absent LINE, nickname and visit date without inventing values", () => {
  const first = mock.rows[0];
  if (!first) throw new Error("fixture missing");
  mock.rows = [{ ...first, nickname: null, creditBalanceSatang: 0, lineLinked: false, lastVisitAt: null }];
  const html = renderToStaticMarkup(<CustomerScreen />);
  expect(html).not.toContain("฿0");
  expect(html).not.toContain('aria-label="LINE"');
  mock.rows = [first];
});
it("uses the typed list endpoint with sort and cursor", () => {
  CustomerScreen();
  expect(mock.query).toHaveBeenCalledWith(
    "customers.list",
    expect.objectContaining({ query: { q: undefined, sort: "last_visit_desc", cursor: null } }),
  );
});
it("debounces 300ms, ignores one-character searches and cancels obsolete timers", () => {
  vi.useFakeTimers();
  const changed = vi.fn();
  const cancel = debounceCustomerSearch("old", changed);
  cancel();
  debounceCustomerSearch("  ใหม่  ", changed);
  vi.advanceTimersByTime(299);
  expect(changed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(changed).toHaveBeenCalledExactlyOnceWith("ใหม่");
  debounceCustomerSearch("ก", changed);
  vi.advanceTimersByTime(300);
  expect(changed).toHaveBeenLastCalledWith("");
});
it("navigates rows and delegates cursor navigation to the shared table", () => {
  const table = CustomerScreen().props.children[1];
  table.props.onRowClick(mock.rows[0]);
  expect(mock.push).toHaveBeenCalledWith("/console/customers/c1");
  table.props.pagination.onNext("next");
  expect(mock.next).toHaveBeenCalledWith("next");
  table.props.pagination.onPrevious();
  expect(mock.previous).toHaveBeenCalled();
});
it("resets pagination when changing sort and links add-customer to C-10", () => {
  const screen = CustomerScreen();
  const table = screen.props.children[1];
  table.props.filters.props.children[1].props.onChange({ target: { value: "name_asc" } });
  expect(mock.state).toHaveBeenCalledWith("name_asc");
  expect(mock.reset).toHaveBeenCalled();
  expect(renderToStaticMarkup(screen)).toContain('href="/console/customers/new"');
});
it("provides loading/error/empty states through DataTable", () => {
  mock.loading = true;
  expect(renderToStaticMarkup(<CustomerScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<CustomerScreen />)).toContain('role="alert"');
  mock.failed = false;
  const previous = mock.rows;
  mock.rows = [];
  expect(renderToStaticMarkup(<CustomerScreen />)).toContain(common.empty);
  mock.rows = previous;
});
it("enables the customer menu", async () => {
  const { entry } = await import("../../src/components/shell-console/navigation/C-08");
  expect(entry.implemented).toBe(true);
});
