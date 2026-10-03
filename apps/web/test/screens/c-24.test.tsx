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
        entries: [
          {
            id: "aaaaaaaa-1111-4111-8111-111111111111",
            at: "2026-10-04T17:30:00.000Z",
            sign: 1,
            receiptNo: "R69-00001",
            serviceName: "อาบน้ำ",
            baseSatang: 50_000,
            ruleLabel: "10%",
            amountSatang: 5_000,
          },
          {
            id: "bbbbbbbb-1111-4111-8111-111111111111",
            at: "2026-10-06T03:00:00.000Z",
            sign: -1,
            receiptNo: null,
            serviceName: "ตัดขน",
            baseSatang: 20_000,
            ruleLabel: null,
            amountSatang: 2_000,
          },
        ],
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
  useTimeZone: () => "Asia/Bangkok",
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
  for (const key of ["entryDate", "entryReceipt", "entryService", "entryBase", "entryRule", "entryAmount"] as const)
    expect(html).toContain(messages[key]);
  // 17:30Z on 4 Oct is 5 Oct in Bangkok; a reversal shows negative money and the reversed marker
  for (const text of ["5 ต.ค. 2569", "R69-00001", "อาบน้ำ", "฿500", "10%", "฿50", "6 ต.ค. 2569", "ตัดขน", "-฿200", "-฿20", messages.reversed])
    expect(html).toContain(text);
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
