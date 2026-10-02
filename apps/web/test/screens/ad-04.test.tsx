import { AdminFeedbackResponse } from "@app/contracts/endpoints/admin.feedback";
import { AdminUpdateFeedbackResponse } from "@app/contracts/endpoints/admin.updateFeedback";
import type { ChangeEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import FeedbackPage from "../../app/(admin)/admin/feedback/page";
import { FeedbackScreen, FeedbackStatusSelect } from "../../src/components/ad-04/feedback-screen";
import { entry } from "../../src/components/shell-admin/navigation/AD-04";
import messages from "../../src/i18n/messages/th/AD-04.json";
import common from "../../src/i18n/messages/th/common.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  query: { data: undefined as unknown, isPending: false, error: null as unknown },
  mutation: { isPending: false },
  queryKey: "",
  queryInput: {} as Record<string, unknown>,
  mutationKey: "",
  options: {} as Record<string, unknown>,
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => ((namespace === "common" ? common : messages) as Record<string, string>)[key],
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: Record<string, unknown>) => {
    mock.queryKey = key;
    mock.queryInput = input;
    return { ...mock.query, refetch: mock.refetch };
  },
  useApiMutation: (key: string, options: Record<string, unknown>) => {
    mock.mutationKey = key;
    mock.options = options;
    return { ...mock.mutation, mutate: mock.mutate };
  },
}));

const row = {
  id: "10000000-0000-4000-8000-000000000001",
  orgName: "Pilot Shop",
  staffName: "น้องเอ",
  pageUrl: "https://app.example.test/console/calendar",
  message: "ปฏิทินโหลดช้า",
  screenshotUrl: "https://files.example.test/shot.png",
  appVersion: "1.0.0",
  status: "new",
  createdAt: "2026-10-02T09:00:00Z",
} as const;
afterEach(() => {
  vi.clearAllMocks();
  mock.query = { data: undefined, isPending: false, error: null };
  mock.mutation = { isPending: false };
});
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children)];
}

it("renders every 06 field of the feedback table from admin.feedback on the page", () => {
  mock.query.data = [row];
  const html = renderToStaticMarkup(FeedbackPage());
  for (const label of ["Feedback", "ร้าน", "ผู้แจ้ง", "ข้อความ", "หน้า", "ภาพ", "สถานะ", "เปลี่ยนสถานะ"]) expect(html).toContain(label);
  expect(mock.queryKey).toBe("admin.feedback");
  expect(mock.queryInput.response).toBe(AdminFeedbackResponse);
  expect(html).toContain("Pilot Shop");
  expect(html).toContain("น้องเอ");
  expect(html).toContain("ปฏิทินโหลดช้า");
  expect(html).toContain(`href="${row.pageUrl}"`);
  expect(html).toContain(`<img src="${row.screenshotUrl}"`);
  for (const label of [messages.statusNew, messages.statusAcknowledged, messages.statusDone]) expect(html).toContain(label);
  expect(html).toMatch(/<option value="new" selected="">/);
});

it("shows no thumbnail without a screenshot and never links a non-http page URL", () => {
  mock.query.data = [{ ...row, screenshotUrl: null, pageUrl: "javascript:alert(1)" }];
  const html = renderToStaticMarkup(<FeedbackScreen />);
  expect(html).not.toContain("<img");
  expect(html).not.toContain('href="javascript');
  expect(html).toContain("javascript:alert(1)");
  expect(html).toContain(messages.unavailable);
});

it("changes the status through admin.updateFeedback and refreshes admin.feedback", () => {
  const select = elements(FeedbackStatusSelect({ row })).find((n) => n.type === "select");
  if (!select) throw new Error("Missing status select");
  (select.props.onChange as (e: ChangeEvent<HTMLSelectElement>) => void)({ target: { value: "done" } } as ChangeEvent<HTMLSelectElement>);
  expect(mock.mutationKey).toBe("admin.updateFeedback");
  expect(mock.options.response).toBe(AdminUpdateFeedbackResponse);
  expect(mock.options.invalidate).toEqual(["admin.feedback"]);
  expect(mock.mutate).toHaveBeenCalledWith({ params: { feedbackId: row.id }, body: { status: "done" } });
});

it("disables the status select while the update is pending", () => {
  mock.mutation.isPending = true;
  expect(renderToStaticMarkup(<FeedbackStatusSelect row={row} />)).toMatch(/<select[^>]*disabled=""/);
});

it("shows loading, empty and API error states with retry", () => {
  mock.query.isPending = true;
  expect(renderToStaticMarkup(<FeedbackScreen />)).toContain('aria-busy="true"');
  mock.query = { data: [], isPending: false, error: null };
  expect(renderToStaticMarkup(<FeedbackScreen />)).toContain(common.empty);
  mock.query = { data: undefined, isPending: false, error: new ApiClientError("FORBIDDEN", "ข้อผิดพลาดจาก API", 403) };
  const html = renderToStaticMarkup(<FeedbackScreen />);
  expect(html).toContain("ข้อผิดพลาดจาก API");
  expect(html).toContain(common.retry);
  FeedbackScreen().props.children[1].props.onRetry();
  expect(mock.refetch).toHaveBeenCalledOnce();
});

it("activates the AD-04 navigation entry", () => {
  expect(entry).toEqual({ id: "AD-04", route: "/admin/feedback", implemented: true });
});
