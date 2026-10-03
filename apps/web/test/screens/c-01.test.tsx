import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardScreen, watchDashboardPush } from "../../src/components/c-01/dashboard-screen";
import messages from "../../src/i18n/messages/th/C-01.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  role: "owner",
  loading: false,
  failed: false,
  query: vi.fn(),
  effect: vi.fn(),
  refetch: vi.fn(),
  data: {
    date: "2026-10-03",
    groom: { total: 7, byStatus: { scheduled: 2, checked_in: 1, in_progress: 1, done: 1, picked_up: 1, no_show: 1 } },
    hotel: { arrivals: 3, departures: 4, inHouse: 5, occupancyPercent: 63 },
    daycare: { count: 6 },
    sales: { paidTotalSatang: 12345, billsClosed: 2 },
    todo: {
      pendingSlips: 2,
      pendingApprovals: 3,
      overdueCareTasks: 4,
      reportCardsToReview: 5,
      unsentMessages: 6,
      pickupsWithoutBill: 7,
      linkRequests: 8,
    },
  },
}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useEffect: (fn: unknown) => mock.effect(fn) }));
vi.mock("next-intl", () => ({ useTranslations: (ns: string) => (key: string) => (ns === "common" ? common : messages)[key as never] }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return {
      data: args[0] === "auth.me" ? { staff: { role: mock.role } } : mock.data,
      isPending: mock.loading,
      isError: mock.failed,
      error: null,
      refetch: mock.refetch,
    };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mock.role = "owner";
  mock.loading = false;
  mock.failed = false;
});

it("renders every supported dashboard card and todo with server values", () => {
  const html = renderToStaticMarkup(<DashboardScreen />);
  for (const key of [
    "groom",
    "arrivals",
    "departures",
    "inHouse",
    "occupancy",
    "daycare",
    "sales",
    "pendingSlips",
    "pendingApprovals",
    "overdueCareTasks",
    "reportCardsToReview",
    "unsentMessages",
    "pickupsWithoutBill",
    "linkRequests",
    "add",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("63%");
  expect(html).toContain("฿123.45");
  expect(html).toContain('data-tone="danger"');
});
it("uses typed dashboard query and refreshes every 60 seconds", () => {
  DashboardScreen();
  expect(mock.query).toHaveBeenCalledWith(
    "dashboard.today",
    expect.objectContaining({ response: expect.anything() }),
    expect.objectContaining({ refetchInterval: 60_000 }),
  );
});
it("hides sales from front desk even if stale owner data remains in cache", () => {
  mock.role = "front_desk";
  const html = renderToStaticMarkup(<DashboardScreen />);
  expect(html).not.toContain(messages.sales);
  expect(html).not.toContain("฿123.45");
});
it("links all todos and new booking to catalogued screens", () => {
  const html = renderToStaticMarkup(<DashboardScreen />);
  for (const href of [
    "/console/slips",
    "/console/bookings?tab=approval",
    "/console/hotel/tasks",
    "/console/report-cards",
    "/console/messages",
    "/console/bills",
    "/console/link-requests",
    "/console/bookings/new",
  ])
    expect(html).toContain(`href="${href}"`);
});
it("shows a skeleton while loading and an API error with retry", () => {
  mock.loading = true;
  expect(renderToStaticMarkup(<DashboardScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<DashboardScreen />)).toContain('role="alert"');
});
it("refreshes on push relay and removes its listener on unmount", () => {
  const worker = new EventTarget();
  const stop = watchDashboardPush(mock.refetch, worker);
  worker.dispatchEvent(new MessageEvent("message", { data: { type: "unrelated" } }));
  expect(mock.refetch).not.toHaveBeenCalled();
  worker.dispatchEvent(new MessageEvent("message", { data: { type: "dashboard-refresh" } }));
  expect(mock.refetch).toHaveBeenCalledTimes(1);
  stop();
  worker.dispatchEvent(new MessageEvent("message", { data: { type: "dashboard-refresh" } }));
  expect(mock.refetch).toHaveBeenCalledTimes(1);
});
it("relays push from the real service worker to open client windows", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const listeners = new Map<string, (event: unknown) => void>();
  const postMessage = vi.fn();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([{ postMessage }]);
  runInNewContext(await readFile(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL,
    self: {
      location: { origin: "https://shop.test" },
      clients: { matchAll },
      registration: { showNotification },
      addEventListener: (key: string, fn: (event: unknown) => void) => listeners.set(key, fn),
    },
  });
  let pending: Promise<unknown> | undefined;
  listeners.get("push")?.({
    data: { json: () => ({ text: "แจ้งเตือน", url: "/console" }) },
    waitUntil: (value: Promise<unknown>) => {
      pending = value;
    },
  });
  await pending;
  expect(matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "dashboard-refresh" });
  expect(showNotification).toHaveBeenCalledWith("PJ-8 Staff", expect.objectContaining({ body: "แจ้งเตือน" }));
});
it("enables the dashboard menu", async () => {
  expect((await import("../../src/components/shell-console/navigation/C-01")).entry.implemented).toBe(true);
});
