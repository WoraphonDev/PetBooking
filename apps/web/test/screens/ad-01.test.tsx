import { AdminLoginResponse } from "@app/contracts/endpoints/admin.login";
import type { FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { AdminLoginForm } from "../../src/components/ad-01/login-form";
import { AdminLoginScreen } from "../../src/components/ad-01/login-screen";
import { navigationItems } from "../../src/components/shell-admin/navigation";
import { entry } from "../../src/components/shell-admin/navigation/AD-01";
import messages from "../../src/i18n/messages/th/AD-01.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  values: ["", ""],
  index: 0,
  setState: vi.fn(),
  replace: vi.fn(),
  mutate: vi.fn(),
  state: { isPending: false, error: null as unknown },
  options: {} as Record<string, unknown>,
  key: "",
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial === "" ? (mock.values[mock.index++] ?? "") : initial, mock.setState],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mock.replace }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
vi.mock("../../src/lib/query", () => ({
  useApiMutation: (key: string, options: Record<string, unknown>) => {
    mock.key = key;
    mock.options = options;
    return { ...mock.state, mutate: mock.mutate };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.values = ["", ""];
  mock.index = 0;
  mock.state = { isPending: false, error: null };
});
const submit = () => AdminLoginForm().props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);

it("renders the spec fields, correct input formats, Thai submit label and 44px controls", () => {
  const html = renderToStaticMarkup(<AdminLoginScreen />);
  for (const label of ["Admin login", "อีเมล", "รหัสผ่าน", "เข้าสู่ระบบ"]) expect(html).toContain(label);
  expect(html).toMatch(/<input[^>]*type="email"[^>]*autoComplete="username"[^>]*required/);
  expect(html).toMatch(/<input[^>]*type="password"[^>]*autoComplete="current-password"[^>]*required/);
  expect(html).toContain("h-11");
  expect(html).toContain("min-w-[360px]");
  expect(html).not.toContain("<nav");
});
it("validates the shared contract before submitting and normalizes the email", () => {
  mock.values = ["  Admin@Example.test ", "secret"];
  submit();
  expect(mock.key).toBe("admin.login");
  expect(mock.options.response).toBe(AdminLoginResponse);
  expect(mock.mutate).toHaveBeenCalledWith({ body: { email: "admin@example.test", password: "secret" } });
});
it.each([
  ["invalid", "secret"],
  ["admin@example.test", ""],
  ["admin@example.test", "x".repeat(129)],
])("does not send invalid input", (email, password) => {
  mock.values = [email, password];
  submit();
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setState).toHaveBeenCalledWith(expect.objectContaining({ [email === "invalid" ? "email" : "password"]: messages.invalid }));
});
it("prevents duplicate submission while pending", () => {
  mock.values = ["admin@example.test", "secret"];
  mock.state.isPending = true;
  const html = renderToStaticMarkup(<AdminLoginScreen />);
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  mock.index = 0;
  submit();
  expect(mock.mutate).not.toHaveBeenCalled();
});
it.each(["INVALID_CREDENTIALS", "ACCOUNT_LOCKED"] as const)("shows the server's Thai %s message inline without a toast", (code) => {
  mock.state.error = new ApiClientError(code, "ข้อความจากเซิร์ฟเวอร์", 401);
  const html = renderToStaticMarkup(<AdminLoginScreen />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("ข้อความจากเซิร์ฟเวอร์");
  expect(mock.options.meta).toEqual({ toast: false });
});
it("navigates to AD-02 after a successful login", () => {
  renderToStaticMarkup(<AdminLoginScreen />);
  (mock.options.onSuccess as () => void)();
  expect(mock.replace).toHaveBeenCalledWith("/admin/organizations");
});

it("activates the implemented AD-01 navigation entry", () => {
  expect(entry.implemented).toBe(true);
  expect(navigationItems().find((item) => item.id === "AD-01")?.href).toBe("/admin/login");
});
