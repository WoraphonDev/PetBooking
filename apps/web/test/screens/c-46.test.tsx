import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackForm, FeedbackWidget, uploadScreenshot } from "../../src/components/c-46/feedback-widget";
import messages from "../../src/i18n/messages/th/C-46.json";

const mock = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutation: vi.fn(),
  api: vi.fn(),
  toast: vi.fn(),
  setState: vi.fn(),
  states: [] as unknown[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [mock.states.length ? mock.states.shift() : initial, mock.setState],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
vi.mock("sonner", () => ({ toast: { success: mock.toast } }));
vi.mock("../../src/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: mock.api,
}));
vi.mock("../../src/lib/query", () => ({
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mock.states = [];
});

const form = (states: unknown[], onSent = vi.fn(), appVersion: string | null = "abc1234") => {
  // useState order: message, screenshot, uploading, error
  mock.states = states;
  return { el: FeedbackForm({ pageUrl: "/console/bookings?tab=all", appVersion, onSent }), onSent };
};

it("renders every 06 field: message, screenshot, current page and version, and the send button", () => {
  const html = renderToStaticMarkup(<FeedbackForm pageUrl="/console/bookings?tab=all" appVersion="abc1234" onSent={vi.fn()} />);
  for (const key of ["message", "screenshot", "page", "version", "send"] as const) expect(html).toContain(messages[key]);
  expect(html).toContain("/console/bookings?tab=all");
  expect(html).toContain("abc1234");
  expect(renderToStaticMarkup(<FeedbackForm pageUrl="/x" appVersion={null} onSent={vi.fn()} />)).toContain("—");
  expect(renderToStaticMarkup(<FeedbackWidget />)).toContain(messages.open);
});

it("sends feedback.create with page, message, screenshot and version, then thanks and closes", async () => {
  const { el, onSent } = form(["ปุ่มบันทึกกดไม่ได้", { fileId: "00000000-0000-4000-8000-000000000001", name: "a.png" }, false, ""]);
  await el.props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).toHaveBeenCalledWith({
    body: {
      pageUrl: "/console/bookings?tab=all",
      message: "ปุ่มบันทึกกดไม่ได้",
      screenshotFileId: "00000000-0000-4000-8000-000000000001",
      appVersion: "abc1234",
    },
  });
  expect(mock.mutation).toHaveBeenCalledWith("feedback.create", expect.anything());
  expect(mock.toast).toHaveBeenCalledWith(messages.thanks);
  expect(onSent).toHaveBeenCalled();
});

it("without screenshot or version only the required fields go; a short message is refused", async () => {
  await form(["หน้าโหลดช้ามาก", null, false, ""], vi.fn(), null).el.props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).toHaveBeenCalledWith({ body: { pageUrl: "/console/bookings?tab=all", message: "หน้าโหลดช้ามาก" } });
  mock.mutate.mockClear();
  await form(["ช้า", null, false, ""]).el.props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setState).toHaveBeenCalledWith(messages.invalid);
});

it("a failed send keeps the form open with the server message", async () => {
  mock.mutate.mockRejectedValue(new Error("boom"));
  const { el, onSent } = form(["ปุ่มบันทึกกดไม่ได้", null, false, ""]);
  await el.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSent).not.toHaveBeenCalled();
  expect(mock.toast).not.toHaveBeenCalled();
});

it("uploads a screenshot as a feedback file through a presigned PUT", async () => {
  mock.api.mockResolvedValue({
    fileId: "00000000-0000-4000-8000-000000000009",
    uploadUrl: "https://s3/put",
    headers: { "Content-Type": "image/png" },
    storageKey: "k",
  });
  const put = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", put);
  const file = new File(["x"], "shot.png", { type: "image/png" });
  expect(await uploadScreenshot(file)).toBe("00000000-0000-4000-8000-000000000009");
  expect(mock.api).toHaveBeenCalledWith(
    "staff.uploadUrl",
    expect.objectContaining({ body: { kind: "feedback", mimeType: "image/png", sizeBytes: 1 } }),
  );
  expect(put).toHaveBeenCalledWith("https://s3/put", expect.objectContaining({ method: "PUT", body: file }));
  put.mockResolvedValue({ ok: false, status: 403 });
  await expect(uploadScreenshot(file)).rejects.toThrow(/403/);
});
