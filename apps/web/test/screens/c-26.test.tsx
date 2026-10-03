import { readFileSync } from "node:fs";
import type { AuditLogItem } from "@app/contracts/dto/audit-log-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { AuditLogScreen, changeLines } from "../../src/components/c-26/audit-log-screen";
import messages from "../../src/i18n/messages/th/C-26.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  rows: [
    {
      id: "a1",
      action: "bill.discount",
      actorType: "staff",
      actorName: "มิก",
      entityType: "bill",
      entityId: "11111111-1111-4111-8111-111111111111",
      before: { billDiscountSatang: 0 },
      after: { billDiscountSatang: 10000 },
      reason: "ลูกค้าประจำ",
      at: "2026-10-05T03:00:00.000Z",
      viaSupport: false,
    },
    {
      id: "a2",
      action: "support.session_start",
      actorType: "platform_admin",
      actorName: "ทีมงาน A",
      entityType: "support_access_log",
      entityId: "22222222-2222-4222-8222-222222222222",
      before: null,
      after: { reason: "ตรวจบั๊ก" },
      reason: "ตรวจบั๊ก",
      at: "2026-10-04T17:30:00.000Z",
      viaSupport: true,
    },
    {
      id: "a3",
      action: "booking.cancel",
      actorType: "system",
      actorName: null,
      entityType: "booking",
      entityId: "33333333-3333-4333-8333-333333333333",
      before: null,
      after: null,
      reason: null,
      at: "2026-10-04T01:00:00.000Z",
      viaSupport: false,
    },
  ] as AuditLogItem[],
  params: "action=bill.discount&from=2026-10-01&to=2026-10-05",
  loading: false,
  failed: false,
  query: vi.fn(),
  replace: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  reset: vi.fn(),
  effect: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (callback: () => void) => mock.effect(callback),
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => (namespace === "common" ? common : messages)[key as never],
  useTimeZone: () => "Asia/Bangkok",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => "/console/settings/audit",
  useSearchParams: () => new URLSearchParams(mock.params),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: { items: mock.rows, nextCursor: "next" }, isPending: mock.loading, isError: mock.failed, error: null, refetch: vi.fn() };
  },
}));
vi.mock("../../src/components/shared/table/cursor", async (original) => ({
  ...(await original<typeof import("../../src/components/shared/table/cursor")>()),
  useCursorPagination: () => ({ cursor: null, hasPrevious: false, next: mock.next, previous: mock.previous, reset: mock.reset }),
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.params = "action=bill.discount&from=2026-10-01&to=2026-10-05";
  mock.loading = false;
  mock.failed = false;
});

it("renders every filter and column label from 06 with Thai action labels", () => {
  const html = renderToStaticMarkup(<AuditLogScreen />);
  for (const key of ["title", "action", "dateRange", "time", "actor", "item", "reason", "change"] as const)
    expect(html).toContain(messages[key]);
  for (const label of [messages.actions.bill__discount, messages.actions.support__session_start, messages.actions.booking__cancel])
    expect(html).toContain(label);
});

it("shows time in the branch timezone, actor names with the support marker and system actors", () => {
  const html = renderToStaticMarkup(<AuditLogScreen />);
  expect(html).toContain("5 ต.ค. 2569 10:00 น.");
  // 17:30Z is already the next local day
  expect(html).toContain("5 ต.ค. 2569 00:30 น.");
  expect(html).toContain("มิก");
  expect(html).toContain(`ทีมงาน A<span class="text-muted-foreground"> · ${messages.viaSupport}</span>`);
  expect(html).toContain(messages.actors.system);
});

it("links entities that have a console page and shows the reason and the before/after diff", () => {
  const html = renderToStaticMarkup(<AuditLogScreen />);
  expect(html).toContain('href="/console/bills/11111111-1111-4111-8111-111111111111"');
  expect(html).toContain('href="/console/bookings/33333333-3333-4333-8333-333333333333"');
  expect(html).not.toContain("/console/support_access_log");
  expect(html).toContain(messages.entities.support_access_log);
  expect(html).toContain("ลูกค้าประจำ");
  expect(html).toContain("billDiscountSatang: 0 → 10000");
  expect(changeLines({ before: null, after: { reason: "x" } })).toEqual(["reason: x"]);
  expect(changeLines({ before: null, after: null })).toEqual([]);
});

it("loads audit.list with the URL filters and the cursor", () => {
  AuditLogScreen();
  expect(mock.query).toHaveBeenCalledWith(
    "audit.list",
    expect.objectContaining({ query: { action: "bill.discount", from: "2026-10-01", to: "2026-10-05", cursor: undefined, limit: 50 } }),
    { enabled: true },
  );
});

it("blocks an invalid date range instead of querying", () => {
  mock.params = "from=2026-10-05&to=2026-10-01";
  const html = renderToStaticMarkup(<AuditLogScreen />);
  expect(html).toContain(messages.invalidFilter);
  expect(mock.query).toHaveBeenLastCalledWith("audit.list", expect.anything(), { enabled: false });
});

it("writes filter changes to the URL and clears them", () => {
  const tree = AuditLogScreen();
  const filters = tree.props.children[1];
  filters.props.children[0].props.children[1].props.onChange({ target: { value: "bill.void" } });
  expect(mock.replace).toHaveBeenLastCalledWith("/console/settings/audit?action=bill.void&from=2026-10-01&to=2026-10-05");
  filters.props.children[0].props.children[1].props.onChange({ target: { value: "" } });
  expect(mock.replace).toHaveBeenLastCalledWith("/console/settings/audit?from=2026-10-01&to=2026-10-05");
  filters.props.children[1].props.children[1].props.children[1].props.onValueChange("2026-10-31");
  expect(mock.replace).toHaveBeenLastCalledWith("/console/settings/audit?action=bill.discount&from=2026-10-01&to=2026-10-31");
  filters.props.children[2].props.onClick();
  expect(mock.replace).toHaveBeenLastCalledWith("/console/settings/audit");
});

it("lists exactly the R-27 audit actions", () => {
  const rules = readFileSync(new URL("../../../../docs/spec/04-business-rules.md", import.meta.url), "utf8");
  const line = rules.split("\n").find((l) => l.includes("รายการ action (type AuditAction)")) ?? "";
  const spec = [...line.matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]?.replace(".", "__"));
  expect(Object.keys(messages.actions).sort()).toEqual(spec.sort());
});

it("delegates cursor paging and shows loading/error/empty states", () => {
  const table = AuditLogScreen().props.children[2];
  table.props.pagination.onNext("next");
  expect(mock.next).toHaveBeenCalledWith("next");
  mock.loading = true;
  expect(renderToStaticMarkup(<AuditLogScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<AuditLogScreen />)).toContain('role="alert"');
  mock.failed = false;
  const previous = mock.rows;
  mock.rows = [];
  expect(renderToStaticMarkup(<AuditLogScreen />)).toContain(common.empty);
  mock.rows = previous;
});
