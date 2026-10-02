import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canSubmit, policyState, resetBody } from "../../src/components/a-03/reset.ts";
import { ResetScreen } from "../../src/components/a-03/reset-screen.tsx";
import messages from "../../src/i18n/messages/th/A-03.json";

const replace = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

type MutationCall = { key: string; options: Record<string, unknown> };
const mutation = vi.hoisted(() => ({ calls: [] as MutationCall[] }));
vi.mock("../../src/lib/query.ts", () => ({
  ApiQueryProvider: ({ children }: { children: unknown }) => children,
  useApiMutation: (key: string, options: Record<string, unknown>) => {
    mutation.calls.push({ key, options });
    return { error: null, isPending: false, mutate: vi.fn() };
  },
}));

type PolicyCase = { name: string; input: { password: string }; expected: { ok: boolean; error: string | null } };
const policyCases: PolicyCase[] = JSON.parse(
  readFileSync(new URL("../../../../docs/spec/vectors/R-24.checkPasswordPolicy.json", import.meta.url), "utf8"),
).cases;

const render = () =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ "A-03": messages }}>
      <ResetScreen token="link-token" />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  mutation.calls.length = 0;
  replace.mockReset();
  toastSuccess.mockReset();
});

describe("A-03 ตั้งรหัสผ่านใหม่", () => {
  it("renders every 06 field label as password inputs with the strength indicator and save button", () => {
    const html = render();
    for (const label of ["ตั้งรหัสผ่านใหม่", "รหัสผ่านใหม่", "ยืนยันรหัสผ่าน", "บันทึก"]) expect(html).toContain(label);
    expect(html.match(/<input[^>]*type="password"[^>]*required/g)).toHaveLength(2);
    expect(html).toContain('id="a03-policy"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("shows the R-24 policy result as the strength indicator, with a Thai message for every policy error", () => {
    expect(policyState("")).toBe("empty");
    for (const c of policyCases.filter((c) => !("email" in c.input))) expect(policyState(c.input.password)).toBe(c.expected.error ?? "ok");
    expect(policyState("x".repeat(129))).toBe("PASSWORD_TOO_LONG");
    for (const state of ["ok", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG", "PASSWORD_ALL_DIGITS", "PASSWORD_SAME_AS_EMAIL"] as const) {
      expect(messages.policy[state]).toBeTruthy();
    }
  });

  it("allows saving only when the new password passes R-24 and the confirmation matches", () => {
    expect(canSubmit("groom2026!", "groom2026!")).toBe(true);
    expect(canSubmit("groom2026!", "groom2026?")).toBe(false);
    expect(canSubmit("12345678", "12345678")).toBe(false);
    expect(canSubmit("", "")).toBe(false);
  });

  it("calls auth.resetConfirm with the link token and new password only (confirmation is not sent)", () => {
    render();
    expect(mutation.calls[0]?.key).toBe("auth.resetConfirm");
    expect(resetBody("link-token", "groom2026!")).toEqual({ token: "link-token", newPassword: "groom2026!" });
  });

  it("goes to /login with the toast 'ตั้งรหัสผ่านแล้ว' after success", () => {
    render();
    const onSuccess = mutation.calls[0]?.options.onSuccess as () => void;
    onSuccess();
    expect(toastSuccess).toHaveBeenCalledWith("ตั้งรหัสผ่านแล้ว");
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
