import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { AccountDevices, AccountScreen, deviceName } from "../../src/components/c-45/account-screen";
import messages from "../../src/i18n/messages/th/C-45.json";

const mock = vi.hoisted(() => ({
  loading: false,
  failed: false,
  pending: false,
  email: "owner@example.test" as string | null,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  message: vi.fn(),
}));
const sessions = [
  { id: "s1", userAgent: "Chrome Linux", lastSeenAt: "2026-10-02T18:30:00Z", current: true },
  { id: "s2", userAgent: "Firefox Windows", lastSeenAt: "2026-10-02T18:00:00Z", current: false },
];
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial, mock.message],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return {
      data:
        key === "auth.me"
          ? { staff: { displayName: "มิก", email: mock.email, role: "owner" }, branch: { timezone: "Asia/Bangkok" } }
          : sessions,
      isPending: mock.loading,
      isError: mock.failed,
      error: null,
    };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: mock.pending };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.mutate.mockReset();
  mock.loading = false;
  mock.failed = false;
  mock.pending = false;
  mock.email = "owner@example.test";
});
const devices = () => AccountDevices({ sessions, timezone: "Asia/Bangkok" });
it("loads profile and sessions and renders all fields with Thai role/date/time", () => {
  const html = renderToStaticMarkup(<AccountScreen />);
  for (const key of ["title", "name", "email", "role", "devices", "list", "current", "revoke"] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["มิก", "owner@example.test", "Chrome", "Firefox", "3 ต.ค. 2569", "01:30"]) expect(html).toContain(text);
  expect(mock.query).toHaveBeenCalledWith("auth.me", expect.anything());
  expect(mock.query).toHaveBeenCalledWith("staffMe.sessions", expect.anything());
});
it("does not render the deferred push or LINE controls", () => {
  const html = renderToStaticMarkup(<AccountScreen />);
  for (const text of ["เปิดแจ้งเตือน", "ปิดแจ้งเตือน", "ผูก LINE"]) expect(html).not.toContain(text);
  expect(mock.mutation).toHaveBeenCalledExactlyOnceWith("staffMe.revokeSession", expect.anything());
});
it.each(["loading", "failed"] as const)("blocks session actions while %s", (key) => {
  mock[key] = true;
  expect(renderToStaticMarkup(<AccountScreen />)).not.toContain(messages.revoke);
});
it("renders nullable email and unknown user agent without claiming a device", () => {
  mock.email = null;
  expect(renderToStaticMarkup(<AccountScreen />)).not.toContain("owner@example.test");
  const label = (key: keyof typeof messages) => messages[key];
  expect(deviceName(null, label)).toBe(messages.unknown);
  expect(deviceName("Custom Device", label)).toBe("Custom Device");
  expect(deviceName("Chrome Edg Windows", label)).toBe("Edge · Windows");
});
it("revokes only the selected other session with the correct path parameter", async () => {
  const row = devices().props.children[1].props.children[1];
  await row.props.children[2].props.onClick();
  expect(mock.mutate).toHaveBeenCalledWith({ params: { sessionId: "s2" } });
  expect(mock.mutation).toHaveBeenCalledWith("staffMe.revokeSession", expect.objectContaining({ invalidate: ["staffMe.sessions"] }));
  expect(devices().props.children[1].props.children[0].props.children[2]).toBeNull();
});
it("blocks duplicate revocations and shows errors without removing devices locally", async () => {
  const button = () => devices().props.children[1].props.children[1].props.children[2];
  mock.pending = true;
  await button().props.onClick();
  expect(mock.mutate).not.toHaveBeenCalled();
  mock.pending = false;
  mock.mutate.mockRejectedValue(new Error("failure"));
  await button().props.onClick();
  expect(mock.message).toHaveBeenCalledWith(expect.any(String));
  expect(sessions).toHaveLength(2);
});
it("enables the account menu for all staff roles", async () => {
  const { entry } = await import("../../src/components/shell-console/navigation/C-45");
  expect(entry.implemented).toBe(true);
});
