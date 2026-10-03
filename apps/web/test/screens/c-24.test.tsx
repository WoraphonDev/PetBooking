import type { ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CommissionReportScreen } from "../../src/components/c-24/commission-report-screen";
import messages from "../../src/i18n/messages/th/C-24.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  report: {
    from: "2026-10-01",
    to: "2026-10-31",
    rows: [
      {
        staffUserId: "11111111-1111-4111-8111-111111111111",
        staffName: "ช่างแพร",
        jobs: 12,
        baseSatang: 612_345,
        amountSatang: 61_234,
        entries: ["aaaaaaaa-1111-4111-8111-111111111111", "bbbbbbbb-1111-4111-8111-111111111111"],
      },
    ],
  } as ReportsCommissionsResponse,
  params: "from=2026-10-01&to=2026-10-31",
  loading: false,
  failed: false,
  query: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => "/console/reports/commissions",
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
  mock.params = "from=2026-10-01&to=2026-10-31";
  mock.loading = false;
  mock.failed = false;
});

it("renders the date range filter, every 06 column and the export button", () => {
  const html = renderToStaticMarkup(<CommissionReportScreen />);
  for (const key of ["title", "dateRange", "staff", "jobs", "base", "amount", "details", "export"] as const)
    expect(html).toContain(messages[key]);
});

it("shows staff name, job count, base money and bold commission per row with expandable entries", () => {
  const html = renderToStaticMarkup(<CommissionReportScreen />);
  expect(html).toContain("ช่างแพร");
  expect(html).toContain(">12<");
  expect(html).toContain("฿6,123.45");
  expect(html).toContain("<strong>฿612.34</strong>");
  expect(html).toContain("<details>");
  expect(html).toContain("2 รายการ");
  expect(html).toContain("aaaaaaaa-1111-4111-8111-111111111111");
});

it("loads reports.commissions for the URL range and exports commissions.csv for the same range", () => {
  const html = renderToStaticMarkup(<CommissionReportScreen />);
  expect(mock.query).toHaveBeenCalledWith(
    "reports.commissions",
    expect.objectContaining({ query: { from: "2026-10-01", to: "2026-10-31" } }),
    { enabled: true },
  );
  expect(html).toContain('href="/api/v1/staff/exports/commissions.csv?from=2026-10-01&amp;to=2026-10-31"');
  expect(html).toContain('download="commissions.csv"');
});

it("asks for a range before loading and blocks a reversed range", () => {
  mock.params = "";
  let html = renderToStaticMarkup(<CommissionReportScreen />);
  expect(html).toContain(messages.pickRange);
  expect(html).not.toContain(messages.export);
  expect(mock.query).toHaveBeenLastCalledWith("reports.commissions", expect.anything(), { enabled: false });
  mock.params = "from=2026-10-31&to=2026-10-01";
  html = renderToStaticMarkup(<CommissionReportScreen />);
  expect(html).toContain(messages.invalidFilter);
  expect(mock.query).toHaveBeenLastCalledWith("reports.commissions", expect.anything(), { enabled: false });
});

it("writes picked dates to the URL", () => {
  const filters = CommissionReportScreen().props.children[1];
  filters.props.children[1].props.children[0].props.onValueChange("2026-09-01");
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/commissions?from=2026-09-01&to=2026-10-31");
  filters.props.children[1].props.children[1].props.onValueChange(null);
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/commissions?from=2026-10-01");
});

it("shows loading, error and empty states", () => {
  mock.loading = true;
  expect(renderToStaticMarkup(<CommissionReportScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<CommissionReportScreen />)).toContain('role="alert"');
  mock.failed = false;
  const previous = mock.report;
  mock.report = { ...previous, rows: [] };
  expect(renderToStaticMarkup(<CommissionReportScreen />)).toContain(common.empty);
  mock.report = previous;
});
