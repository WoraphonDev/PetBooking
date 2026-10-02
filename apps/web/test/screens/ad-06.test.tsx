import { AdminAnalyticsResponse } from "@app/contracts/endpoints/admin.analytics";
import { AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AnalyticsPage from "../../app/(admin)/admin/analytics/page";
import { AnalyticsScreen, pilotRange } from "../../src/components/ad-06/analytics-screen";
import { entry } from "../../src/components/shell-admin/navigation/AD-06";
import messages from "../../src/i18n/messages/th/AD-06.json";
import common from "../../src/i18n/messages/th/common.json";
import { ApiClientError } from "../../src/lib/api";

type Query = { data: unknown; isPending: boolean; error: unknown; refetch: () => void };
const mock = vi.hoisted(() => ({
  queries: {} as Record<string, Query>,
  inputs: {} as Record<string, Record<string, unknown>>,
  now: new Date("2026-10-02T18:30:00Z"), // 3 Oct 01:30 in Bangkok
}));
const fresh = (data: unknown = undefined): Query => ({ data, isPending: false, error: null, refetch: vi.fn() });
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const text = ((namespace === "common" ? common : messages) as Record<string, string>)[key] ?? key;
    return values ? text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "") : text;
  },
  useNow: () => mock.now,
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: Record<string, unknown>) => {
    mock.inputs[key] = input;
    return mock.queries[key];
  },
}));

const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const metrics = (orgId: string) => ({
  orgId,
  activeDays7: 5,
  bookingsByChannel: { walk_in: 3, phone: 1, chat: 0, line_liff: 6, booking_link: 0, ota: 0, import: 0 },
  onlineShare: 60,
  noShowRate: 8,
  pushUsed: 42,
  reportCardsSent: 7,
  billsClosed: 31,
});
const org = {
  id: ORG,
  name: "Pilot Shop",
  slug: "pilot",
  status: "pilot",
  branchName: "B",
  bookingSlug: "b",
  ownerEmail: null,
  lineStatus: null,
  createdAt: "2026-10-01T00:00:00Z",
  lastActivityAt: null,
};
afterEach(() => {
  vi.clearAllMocks();
  mock.queries = {};
});

it("asks for the 7 Bangkok days ending today", () => {
  expect(pilotRange(mock.now)).toEqual({ from: "2026-09-27", to: "2026-10-03" });
  expect(pilotRange(new Date("2026-03-03T00:00:00Z"))).toEqual({ from: "2026-02-25", to: "2026-03-03" });
});

it("renders every 06 column from admin.analytics with shop names from admin.orgs", () => {
  mock.queries = { "admin.analytics": fresh({ orgs: [metrics(ORG), metrics(OTHER)] }), "admin.orgs": fresh([org]) };
  const html = renderToStaticMarkup(AnalyticsPage());
  for (const label of ["Analytics นำร่อง", "ร้าน", "วันที่ใช้งานใน 7 วัน", "จองออนไลน์ %", "No-show %", "Push ที่ใช้", "บิลที่ปิด"])
    expect(html).toContain(label);
  expect(mock.inputs["admin.analytics"]).toEqual({ query: { from: "2026-09-27", to: "2026-10-03" }, response: AdminAnalyticsResponse });
  expect(mock.inputs["admin.orgs"]?.response).toBe(AdminOrgsResponse);
  expect(html).toContain("27 ก.ย. 2569 – 3 ต.ค. 2569");
  expect(html).toContain("Pilot Shop");
  expect(html).toContain("60%");
  expect(html).toContain("8%");
  for (const n of [">5<", ">42<", ">31<"]) expect(html).toContain(n);
  // an org missing from admin.orgs is shown without a fabricated name
  expect(html).toContain(messages.unavailable);
  expect(html).not.toContain("reportCardsSent");
});

it("shows loading, empty, and the API error with a retry of the failed query", () => {
  mock.queries = { "admin.analytics": { ...fresh(), isPending: true }, "admin.orgs": fresh([org]) };
  expect(renderToStaticMarkup(<AnalyticsScreen />)).toContain('aria-busy="true"');
  mock.queries = { "admin.analytics": fresh({ orgs: [] }), "admin.orgs": fresh([org]) };
  expect(renderToStaticMarkup(<AnalyticsScreen />)).toContain(common.empty);
  const failed = { ...fresh(), error: new ApiClientError("FORBIDDEN", "ข้อผิดพลาดจาก API", 403) };
  mock.queries = { "admin.analytics": failed, "admin.orgs": fresh([org]) };
  const html = renderToStaticMarkup(<AnalyticsScreen />);
  expect(html).toContain("ข้อผิดพลาดจาก API");
  expect(html).toContain(common.retry);
  AnalyticsScreen().props.children[1].props.onRetry();
  expect(failed.refetch).toHaveBeenCalledOnce();
  expect(mock.queries["admin.orgs"]?.refetch).not.toHaveBeenCalled();
});

it("activates the AD-06 navigation entry", () => {
  expect(entry).toEqual({ id: "AD-06", route: "/admin/analytics", implemented: true });
});
