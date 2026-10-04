import type { ReportsSalesResponse } from "@app/contracts/endpoints/reports.sales";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { presetRange } from "../../src/components/c-23/date-presets";
import { SalesReportScreen } from "../../src/components/c-23/sales-report-screen";
import messages from "../../src/i18n/messages/th/C-23.json";
import common from "../../src/i18n/messages/th/common.json";

const byDay: ReportsSalesResponse = {
  from: "2026-10-01",
  to: "2026-10-02",
  rows: [
    { key: "2026-10-01", billCount: 3, grossSatang: 150_000, discountSatang: 10_000, netSatang: 140_000 },
    { key: "2026-10-02", billCount: 1, grossSatang: 50_050, discountSatang: 0, netSatang: 50_050 },
  ],
  totals: { billCount: 4, grossSatang: 200_050, discountSatang: 10_000, netSatang: 190_050 },
  payments: [
    { method: "cash", amountSatang: 90_050 },
    { method: "promptpay", amountSatang: 100_000 },
  ],
};
const mock = vi.hoisted(() => ({
  report: undefined as ReportsSalesResponse | undefined,
  params: "from=2026-10-01&to=2026-10-02",
  loading: false,
  failed: false,
  query: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => "/console/reports/sales",
  useSearchParams: () => new URLSearchParams(mock.params),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: mock.report, isPending: mock.loading, isError: mock.failed, error: null, refetch: vi.fn() };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.report = byDay;
  mock.params = "from=2026-10-01&to=2026-10-02";
  mock.loading = false;
  mock.failed = false;
});
mock.report = byDay;

it("renders every 06 field: date range + shortcuts, group by, totals cards, chart, table, payments and export", () => {
  const html = renderToStaticMarkup(<SalesReportScreen />);
  for (const key of [
    "title",
    "dateRange",
    "preset_today",
    "preset_last7",
    "preset_thisMonth",
    "preset_lastMonth",
    "groupBy",
    "group_day",
    "group_service",
    "group_groomer",
    "group_method",
    "totals",
    "gross",
    "discount",
    "net",
    "chart",
    "table",
    "billCount",
    "payments",
    "method",
    "amount",
    "export",
  ] as const)
    expect(html).toContain(messages[key]);
});

it("loads reports.sales for the URL range grouped by day by default and shows money in baht", () => {
  const html = renderToStaticMarkup(<SalesReportScreen />);
  expect(mock.query).toHaveBeenCalledWith(
    "reports.sales",
    expect.objectContaining({ query: { from: "2026-10-01", to: "2026-10-02", groupBy: "day" } }),
    { enabled: true },
  );
  for (const text of ["฿2,000.50", "฿100", "฿1,900.50", "1 ต.ค. 2569", "2 ต.ค. 2569", "<strong>฿1,400</strong>", "เงินสด", "฿900.50"])
    expect(html).toContain(text);
  expect(html).toContain('aria-checked="true"');
});

it("exports bills.csv and bill_lines.csv for the same range", () => {
  const html = renderToStaticMarkup(<SalesReportScreen />);
  expect(html).toContain('href="/api/v1/staff/exports/bills.csv?from=2026-10-01&amp;to=2026-10-02"');
  expect(html).toContain('href="/api/v1/staff/exports/bill_lines.csv?from=2026-10-01&amp;to=2026-10-02"');
  expect(html).toContain('download="bills.csv"');
  expect(html).toContain('download="bill_lines.csv"');
});

it("groups by groomer: no chart, the null key is ไม่ระบุช่าง", () => {
  mock.params = "from=2026-10-01&to=2026-10-02&groupBy=groomer";
  mock.report = {
    ...byDay,
    rows: [
      { key: "ช่างแพร", billCount: 2, grossSatang: 100_000, discountSatang: 0, netSatang: 100_000 },
      { key: null, billCount: 1, grossSatang: 5_000, discountSatang: 0, netSatang: 5_000 },
    ],
  };
  const html = renderToStaticMarkup(<SalesReportScreen />);
  expect(mock.query).toHaveBeenLastCalledWith(
    "reports.sales",
    expect.objectContaining({ query: expect.objectContaining({ groupBy: "groomer" }) }),
    {
      enabled: true,
    },
  );
  expect(html).toContain("ช่างแพร");
  expect(html).toContain(messages.noGroomer);
  expect(html).not.toContain(`>${messages.chart}<`);
});

it("labels payment-method rows with the enum label", () => {
  mock.params = "from=2026-10-01&to=2026-10-02&groupBy=method";
  mock.report = { ...byDay, rows: [{ key: "bank_transfer", billCount: 1, grossSatang: 1_000, discountSatang: 0, netSatang: 1_000 }] };
  expect(renderToStaticMarkup(<SalesReportScreen />)).toContain("โอนเงิน");
});

it("asks for a range first and blocks a reversed or > 366-day range", () => {
  mock.params = "";
  let html = renderToStaticMarkup(<SalesReportScreen />);
  expect(html).toContain(messages.pickRange);
  expect(mock.query).toHaveBeenLastCalledWith("reports.sales", expect.anything(), { enabled: false });
  for (const params of ["from=2026-10-02&to=2026-10-01", "from=2025-01-01&to=2026-10-01"]) {
    mock.params = params;
    html = renderToStaticMarkup(<SalesReportScreen />);
    expect(html).toContain(messages.invalidFilter);
    expect(html).not.toContain(messages.exportBills);
    expect(mock.query).toHaveBeenLastCalledWith("reports.sales", expect.anything(), { enabled: false });
  }
});

it("date shortcuts use the branch-local today", () => {
  expect(presetRange("today", "2026-10-04")).toEqual({ from: "2026-10-04", to: "2026-10-04" });
  expect(presetRange("last7", "2026-10-04")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  expect(presetRange("thisMonth", "2026-10-04")).toEqual({ from: "2026-10-01", to: "2026-10-04" });
  expect(presetRange("lastMonth", "2026-10-04")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
});

it("writes filters to the URL (shortcut, group, dates)", () => {
  const screen = SalesReportScreen();
  const filters = screen.props.children[1].props.children;
  const dateFieldset = filters[0].props.children;
  dateFieldset[1].props.children[0].props.onValueChange("2026-09-01");
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/sales?from=2026-09-01&to=2026-10-02");
  dateFieldset[2].props.children[3].props.onClick();
  expect(mock.replace).toHaveBeenLastCalledWith(
    expect.stringMatching(/^\/console\/reports\/sales\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/),
  );
  const groups = filters[1].props.children[1].props.children;
  groups[3].props.onClick();
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/sales?from=2026-10-01&to=2026-10-02&groupBy=method");
});

it("shows loading, error and empty states", () => {
  mock.loading = true;
  mock.report = undefined;
  expect(renderToStaticMarkup(<SalesReportScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<SalesReportScreen />)).toContain('role="alert"');
  mock.failed = false;
  mock.report = { ...byDay, rows: [], payments: [] };
  expect(renderToStaticMarkup(<SalesReportScreen />)).toContain(common.empty);
});
