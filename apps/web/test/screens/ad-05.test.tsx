import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import DataRequestsPage from "../../app/(admin)/admin/data-requests/page";
import { DataRequestsScreen, daysLeft, ResolveDialog } from "../../src/components/ad-05/data-requests-screen";
import { entry } from "../../src/components/shell-admin/navigation/AD-05";
import messages from "../../src/i18n/messages/th/AD-05.json";
import common from "../../src/i18n/messages/th/common.json";

const NOW = Date.parse("2026-10-05T03:00:00.000Z");
const req = (over: Record<string, unknown> = {}) => ({
  id: "10000000-0000-4000-8000-000000000001",
  orgName: "Pilot Shop",
  ownerProfileId: "10000000-0000-4000-8000-0000000000a1",
  type: "delete",
  status: "open",
  note: null,
  createdAt: "2026-09-25T03:00:00.000Z",
  ...over,
});
const mock = vi.hoisted(() => ({
  data: [] as unknown[],
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  setState: vi.fn(),
  states: [] as unknown[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [mock.states.length ? mock.states.shift() : initial, mock.setState],
}));
vi.mock("next-intl", () => ({
  useNow: () => new Date(NOW),
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
/** every element in a JSX tree (to look inside a form without rendering the Radix dialog) */
function elements(node: unknown): { props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as { props: Record<string, unknown> };
  return [el, ...elements(el.props.children)];
}
const hasWarning = (form: unknown) => elements(form).some((e) => e.props.role === "alert" && e.props.children === messages.deleteWarning);
afterEach(() => {
  vi.clearAllMocks();
  mock.data = [];
  mock.states = [];
});

it("loads admin.dataRequests and renders every 06 column, the days left out of 30 and the action only for open requests", () => {
  mock.data = [
    req(),
    req({
      id: "10000000-0000-4000-8000-000000000002",
      type: "access",
      status: "done",
      note: "ส่งไฟล์แล้ว",
      createdAt: "2026-08-01T03:00:00.000Z",
    }),
    req({ id: "10000000-0000-4000-8000-000000000003", createdAt: "2026-08-20T03:00:00.000Z" }),
  ];
  const html = renderToStaticMarkup(<DataRequestsPage />);
  for (const key of ["title", "shop", "type", "status", "requestedAt", "note", "resolve", "statusOpen", "statusDone"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["Pilot Shop", "ขอลบข้อมูล", "ขอสำเนาข้อมูล", "ส่งไฟล์แล้ว", "เหลือ 20 วัน", "เกินกำหนด 16 วัน"]) expect(html).toContain(text);
  expect(html.split(`>${messages.resolve}</button>`).length - 1).toBe(2);
  expect(mock.query).toHaveBeenCalledWith("admin.dataRequests", expect.anything());
  expect(entry.implemented).toBe(true);
});

it("counts days left from the 30-day window", () => {
  expect(daysLeft("2026-10-05T03:00:00.000Z", NOW)).toBe(30);
  expect(daysLeft("2026-09-05T03:00:00.000Z", NOW)).toBe(0);
  expect(daysLeft("2026-09-01T03:00:00.000Z", NOW)).toBe(-4);
});

it("the dialog warns before a delete is marked done, then sends status + note", async () => {
  const onSubmit = vi.fn();
  // useState order: status, note
  mock.states = ["done", "ลบข้อมูลครบทุกตาราง"];
  const dialog = ResolveDialog({ request: req() as never, pending: false, onCancel: vi.fn(), onSubmit });
  const form = dialog.props.children.props.children;
  expect(hasWarning(form)).toBe(true);
  await form.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenCalledWith({ status: "done", note: "ลบข้อมูลครบทุกตาราง" });
  mock.states = ["rejected", "  "];
  const rejecting = ResolveDialog({ request: req() as never, pending: false, onCancel: vi.fn(), onSubmit }).props.children.props.children;
  expect(hasWarning(rejecting)).toBe(false);
  await rejecting.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenLastCalledWith({ status: "rejected" });
});

it("resolving calls admin.resolveDataRequest and refreshes the list", async () => {
  mock.data = [req()];
  mock.states = [req(), ""];
  const screen = DataRequestsScreen();
  const dialog = screen.props.children[3];
  await dialog.props.onSubmit({ status: "done" });
  expect(mock.mutate).toHaveBeenCalledWith({ params: { requestId: req().id }, body: { status: "done" } });
  expect(mock.mutation).toHaveBeenCalledWith("admin.resolveDataRequest", expect.objectContaining({ invalidate: ["admin.dataRequests"] }));
});
