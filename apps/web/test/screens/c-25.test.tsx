import type { ReportsOccupancyResponse } from "@app/contracts/endpoints/reports.occupancy";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { OccupancyChart } from "../../src/components/c-25/occupancy-chart";
import { OccupancyScreen } from "../../src/components/c-25/occupancy-screen";
import { canAccess, menuItems } from "../../src/components/shell-console/navigation";
import messages from "../../src/i18n/messages/th/C-25.json";
import common from "../../src/i18n/messages/th/common.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  report: {
    from: "2026-10-01",
    to: "2026-10-02",
    days: [
      { date: "2026-10-01", occupiedUnits: 1, totalUnits: 3, percent: 33 },
      { date: "2026-10-02", occupiedUnits: 0, totalUnits: 3, percent: 0 },
    ],
    byRoomType: [
      { roomTypeId: "11111111-1111-4111-8111-111111111111", roomTypeName: "ห้องแมว", occupiedNights: 1, totalNights: 6, percent: 17 },
    ],
  } as ReportsOccupancyResponse,
  params: "from=2026-10-01&to=2026-10-02",
  loading: false,
  error: null as unknown,
  query: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => "/console/reports/occupancy",
  useSearchParams: () => new URLSearchParams(mock.params),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: mock.report, isPending: mock.loading, isError: mock.error !== null, error: mock.error, refetch: mock.refetch };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.params = "from=2026-10-01&to=2026-10-02";
  mock.loading = false;
  mock.error = null;
});

it("renders every C-25 field and the approved room-type DTO columns", () => {
  const html = renderToStaticMarkup(<OccupancyScreen />);
  for (const key of ["title", "dateRange", "chart", "byRoomType", "roomType", "occupiedNights", "totalNights", "percent"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["ห้องแมว", ">1<", ">6<", "17%", "1 ต.ค. 2569", "2 ต.ค. 2569", "33%", "0%"]) expect(html).toContain(text);
});

it("loads reports.occupancy with the selected inclusive local date range", () => {
  renderToStaticMarkup(<OccupancyScreen />);
  expect(mock.query).toHaveBeenLastCalledWith(
    "reports.occupancy",
    expect.objectContaining({ query: { from: "2026-10-01", to: "2026-10-02" } }),
    { enabled: true },
  );
});

it("enables the occupancy menu only for owners and keeps the existing route permission guard", () => {
  expect(menuItems("owner").find((entry) => entry.id === "C-25")).toEqual({ id: "C-25", href: "/console/reports/occupancy" });
  expect(canAccess("owner", "/console/reports/occupancy")).toBe(true);
  for (const role of ["front_desk", "staff"] as const) {
    expect(menuItems(role).some((entry) => entry.id === "C-25")).toBe(false);
    expect(canAccess(role, "/console/reports/occupancy")).toBe(false);
  }
});

it("asks for both dates before requesting data and hides stale report data", () => {
  for (const params of ["", "from=2026-10-01", "to=2026-10-02"]) {
    mock.params = params;
    const html = renderToStaticMarkup(<OccupancyScreen />);
    expect(html).toContain(messages.pickRange);
    expect(html).not.toContain("ห้องแมว");
    expect(mock.query).toHaveBeenLastCalledWith("reports.occupancy", expect.anything(), { enabled: false });
  }
});

it("blocks reversed, impossible and over-93-day ranges without formatting invalid dates", () => {
  for (const params of [
    "from=2026-10-02&to=2026-10-01",
    "from=2026-02-30&to=2026-03-01",
    "from=bad&to=2026-10-01",
    "from=2026-01-01&to=2026-04-04",
  ]) {
    mock.params = params;
    const html = renderToStaticMarkup(<OccupancyScreen />);
    expect(html).toContain(messages.invalidFilter);
    expect(html).not.toContain("ห้องแมว");
    expect(mock.query).toHaveBeenLastCalledWith("reports.occupancy", expect.anything(), { enabled: false });
  }
});

it("accepts one-day and exactly 93-day ranges", () => {
  for (const params of ["from=2026-10-01&to=2026-10-01", "from=2026-01-01&to=2026-04-03"]) {
    mock.params = params;
    renderToStaticMarkup(<OccupancyScreen />);
    expect(mock.query).toHaveBeenLastCalledWith("reports.occupancy", expect.anything(), { enabled: true });
  }
});

it("updates and clears URL dates while retaining other filters", () => {
  mock.params += "&view=report";
  const filters = OccupancyScreen().props.children[1].props.children[1].props.children;
  filters[0].props.onValueChange("2026-09-01");
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/occupancy?from=2026-09-01&to=2026-10-02&view=report");
  filters[1].props.onValueChange(null);
  expect(mock.replace).toHaveBeenLastCalledWith("/console/reports/occupancy?from=2026-10-01&view=report");
});

it("shows loading and the API error with retry, without displaying stale chart data", () => {
  mock.loading = true;
  let html = renderToStaticMarkup(<OccupancyScreen />);
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toContain("33%");
  mock.loading = false;
  mock.error = new ApiClientError("FORBIDDEN", "ไม่มีสิทธิ์ใช้งาน", 403);
  html = renderToStaticMarkup(<OccupancyScreen />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("ไม่มีสิทธิ์ใช้งาน");
  expect(html).toContain(common.retry);
  expect(html).not.toContain("33%");
  OccupancyScreen().props.children[2].props.children[1].props.children[1].props.onRetry();
  expect(mock.refetch).toHaveBeenCalledOnce();
});

it("renders empty states for both the chart and room types", () => {
  const previous = mock.report;
  try {
    mock.report = { ...previous, days: [], byRoomType: [] };
    expect(renderToStaticMarkup(<OccupancyScreen />).split(common.empty)).toHaveLength(3);
  } finally {
    mock.report = previous;
  }
});

it("uses a percent line series, Thai dates and accessible server percentages, including zero capacity", () => {
  const days = [...mock.report.days, { date: "2026-10-03", occupiedUnits: 0, totalUnits: 0, percent: 0 }];
  const html = renderToStaticMarkup(<OccupancyChart days={days} label={messages.chart} />);
  expect(html).toContain('aria-label="กราฟ"');
  expect(html).toContain("3 ต.ค. 2569");
  expect(html).toContain("33%");
  expect(html).not.toContain("NaN");
  const chart = OccupancyChart({ days, label: messages.chart }).props.children[1].props.children.props.children;
  expect(chart.props.data).toEqual(days.map((day) => ({ ...day, label: expect.any(String) })));
  expect(chart.props.children[2].props.tickFormatter(33)).toBe("33%");
  expect(chart.props.children[3].props.formatter(0)).toBe("0%");
  expect(chart.props.children[4].props.dataKey).toBe("percent");
});
