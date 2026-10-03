import type { SkippedMessageItem } from "@app/contracts/dto/skipped-message-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { TEMPLATES } from "../../../../packages/server/src/notify/keys";
import { SkippedMessagesScreen } from "../../src/components/c-22/skipped-messages-screen";
import messages from "../../src/i18n/messages/th/C-22.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({
  used: 70,
  quota: 100,
  loading: false,
  failed: false,
  statusFailed: false,
  copying: null as string | null,
  query: vi.fn(),
  state: vi.fn(),
  relative: vi.fn(() => "5 นาทีที่แล้ว"),
  refetch: vi.fn(),
  write: vi.fn(),
  open: vi.fn(),
  rows: [
    {
      id: "message1",
      templateKey: "customer.booking_confirmed",
      recipientName: "มิก",
      skipReason: "quota_exhausted",
      text: "ยืนยันใบจอง\nเวลา 10:00",
      createdAt: "2026-10-03T10:00:00Z",
    },
  ] as SkippedMessageItem[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial === null ? mock.copying : initial, mock.state],
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) =>
    Object.assign((key: string) => (ns === "common" ? common : messages)[key as never], { has: (key: string) => key in messages }),
  useNow: () => new Date("2026-10-03T10:05:00Z"),
  useFormatter: () => ({ relativeTime: mock.relative }),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    const status = args[0] === "line.status";
    return {
      data: status ? { usedThisMonth: mock.used, monthlyPushQuota: mock.quota } : mock.rows,
      isPending: mock.loading,
      isError: status ? mock.statusFailed : mock.failed,
      error: null,
      refetch: mock.refetch,
    };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mock.used = 70;
  mock.quota = 100;
  mock.loading = false;
  mock.failed = false;
  mock.statusFailed = false;
  mock.copying = null;
});

it("renders quota and every supported message field with Thai labels", () => {
  const html = renderToStaticMarkup(<SkippedMessagesScreen />);
  for (const key of ["title", "quota", "economy", "recipient", "subject", "reason", "text", "time", "copy"] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("มิก");
  expect(html).toContain(messages.template_customer_booking_confirmed);
  expect(html).toContain("ยืนยันใบจอง");
  expect(html).toContain("5 นาทีที่แล้ว");
  expect(html).toContain('href="/console/settings/policy"');
  expect(mock.relative).toHaveBeenCalledWith(new Date("2026-10-03T10:00:00Z"), new Date("2026-10-03T10:05:00Z"));
});
it("loads both typed APIs with the specified seven-day default", () => {
  SkippedMessagesScreen();
  expect(mock.query).toHaveBeenCalledWith("line.status", expect.objectContaining({ response: expect.anything() }), expect.anything());
  expect(mock.query).toHaveBeenCalledWith(
    "line.skipped",
    expect.objectContaining({ query: { days: 7 }, response: expect.anything() }),
    expect.anything(),
  );
});
it("uses orange at 70 percent and red at 90 percent without division by zero", () => {
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).toContain("accent-orange-500");
  mock.used = 90;
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).toContain("accent-red-600");
  mock.used = 69;
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).not.toContain("accent-orange-500");
  mock.quota = 0;
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).not.toContain("NaN");
});
it("copies exact server text before opening OA Manager", async () => {
  const calls: string[] = [];
  mock.write.mockImplementation(async () => {
    calls.push("copy");
  });
  mock.open.mockImplementation(() => {
    calls.push("open");
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: mock.write } });
  vi.stubGlobal("window", { open: mock.open });
  const table = SkippedMessagesScreen().props.children[3];
  const textColumn = table.props.columns.find((c: { id: string }) => c.id === "text");
  await textColumn.cell(mock.rows[0]).props.children[1].props.onClick();
  expect(mock.write).toHaveBeenCalledWith(mock.rows[0]?.text);
  expect(calls).toEqual(["copy", "open"]);
  expect(mock.open).toHaveBeenCalledWith("https://manager.line.biz/", "_blank", "noopener,noreferrer");
});
it("keeps the message available and does not open Manager when clipboard access fails", async () => {
  mock.write.mockRejectedValue(new Error("permission denied"));
  vi.stubGlobal("navigator", { clipboard: { writeText: mock.write } });
  vi.stubGlobal("window", { open: mock.open });
  const table = SkippedMessagesScreen().props.children[3];
  const textColumn = table.props.columns.find((c: { id: string }) => c.id === "text");
  await textColumn.cell(mock.rows[0]).props.children[1].props.onClick();
  expect(mock.open).not.toHaveBeenCalled();
  expect(mock.state).toHaveBeenCalledWith(messages.copyFailed);
  expect(mock.rows[0]?.text).toContain("ยืนยันใบจอง");
});
it("provides loading, empty and error states through the shared table", () => {
  mock.loading = true;
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).toContain('aria-busy="true"');
  mock.loading = false;
  mock.failed = true;
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).toContain('role="alert"');
  mock.failed = false;
  const saved = mock.rows;
  mock.rows = [];
  expect(renderToStaticMarkup(<SkippedMessagesScreen />)).toContain(common.empty);
  mock.rows = saved;
});
it("retains skipped messages even when the LINE status is unavailable", () => {
  mock.statusFailed = true;
  const html = renderToStaticMarkup(<SkippedMessagesScreen />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("ยืนยันใบจอง");
});
it("enables the messages menu", async () => {
  expect((await import("../../src/components/shell-console/navigation/C-22")).entry.implemented).toBe(true);
});
it("provides a Thai label for every catalogued template and no invented template labels", () => {
  const labels = Object.keys(messages).filter((key) => key.startsWith("template_"));
  expect(labels.sort()).toEqual(
    Object.keys(TEMPLATES)
      .map((key) => `template_${key.replaceAll(".", "_")}`)
      .sort(),
  );
  for (const key of labels) expect(messages[key as keyof typeof messages]).toMatch(/\p{Script=Thai}/u);
});
it("preserves unnamed noncustomer recipients and missing skip reasons without inventing names", () => {
  const saved = mock.rows;
  const first = saved[0];
  if (!first) throw new Error("fixture missing");
  mock.rows = [{ ...first, recipientName: null, skipReason: null }];
  const html = renderToStaticMarkup(<SkippedMessagesScreen />);
  expect(html).not.toContain("มิก");
  expect(html).toContain("—");
  mock.rows = saved;
});
it("prevents duplicate copies while an earlier clipboard operation is pending", async () => {
  mock.copying = "message1";
  const table = SkippedMessagesScreen().props.children[3];
  const column = table.props.columns.find((c: { id: string }) => c.id === "text");
  const button = column.cell(mock.rows[0]).props.children[1];
  expect(button.props.disabled).toBe(true);
  await button.props.onClick();
  expect(mock.write).not.toHaveBeenCalled();
});
