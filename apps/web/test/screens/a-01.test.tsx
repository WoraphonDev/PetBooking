import type { StaffMe } from "@app/contracts/dto/staff-me";
import { AuthStaffLoginResponse } from "@app/contracts/endpoints/auth.staffLogin";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { destinationFor, isComplete, loginBody } from "../../src/components/a-01/login.ts";
import { LoginScreen } from "../../src/components/a-01/login-screen.tsx";
import messages from "../../src/i18n/messages/th/A-01.json";
import { ApiClientError } from "../../src/lib/api.ts";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

type MutationCall = { key: string; options: Record<string, unknown> };
const mutation = vi.hoisted(() => ({
  calls: [] as MutationCall[],
  state: { error: null as unknown, isPending: false },
  mutate: vi.fn(),
}));
vi.mock("../../src/lib/query.ts", () => ({
  ApiQueryProvider: ({ children }: { children: unknown }) => children,
  useApiMutation: (key: string, options: Record<string, unknown>) => {
    mutation.calls.push({ key, options });
    return { ...mutation.state, mutate: mutation.mutate };
  },
}));

const render = () =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ "A-01": messages }}>
      <LoginScreen />
    </NextIntlClientProvider>,
  );
const me = (role: StaffMe["staff"]["role"]): StaffMe => ({
  staff: { id: "00000000-0000-4000-8000-000000000001", displayName: "A", email: "a@shop.test", role, isGroomer: false, lineLinked: false },
  organization: { id: "00000000-0000-4000-8000-000000000002", name: "Shop", status: "active" },
  branch: {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Shop",
    bookingSlug: "shop",
    timezone: "Asia/Bangkok",
    modules: { grooming: true, hotel: false, daycare: false },
  },
  permissions: [],
  supportMode: false,
});

afterEach(() => {
  mutation.calls.length = 0;
  mutation.state = { error: null, isPending: false };
  replace.mockReset();
});

describe("A-01 เข้าสู่ระบบ (ร้าน)", () => {
  it("renders every 06 field label, input format and the forgot-password link", () => {
    const html = render();
    for (const label of ["เข้าสู่ระบบ (ร้าน)", "อีเมล", "รหัสผ่าน", "เข้าสู่ระบบ", "ลืมรหัสผ่าน", "แสดงรหัสผ่าน"]) expect(html).toContain(label);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*autoComplete="username"[^>]*required/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*required/);
    expect(html).toContain('href="/forgot-password"');
    // auth.staffLine (เข้าด้วย LINE) is deferred to a later task per the card
    expect(html).not.toContain("LINE");
  });

  it("keeps the login button disabled until both required fields are filled", () => {
    expect(render()).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(isComplete("", "secret")).toBe(false);
    expect(isComplete("  ", "secret")).toBe(false);
    expect(isComplete("a@shop.test", "")).toBe(false);
    expect(isComplete("a@shop.test", "secret")).toBe(true);
  });

  it("submits auth.staffLogin with a trimmed lowercase email and the contract response schema", () => {
    render();
    expect(mutation.calls[0]?.key).toBe("auth.staffLogin");
    expect(mutation.calls[0]?.options).toMatchObject({ response: AuthStaffLoginResponse, meta: { toast: false } });
    expect(loginBody("  Owner@Shop.TEST ", "p@ss Word")).toEqual({ email: "owner@shop.test", password: "p@ss Word" });
  });

  it("goes to /console for owner and front_desk and /staff for staff after success", () => {
    render();
    const onSuccess = mutation.calls[0]?.options.onSuccess as (data: StaffMe) => void;
    for (const [role, path] of [
      ["owner", "/console"],
      ["front_desk", "/console"],
      ["staff", "/staff"],
    ] as const) {
      onSuccess(me(role));
      expect(replace).toHaveBeenLastCalledWith(path);
      expect(destinationFor(me(role))).toBe(path);
    }
  });

  it.each(["INVALID_CREDENTIALS", "ACCOUNT_LOCKED"] as const)("shows %s under the form", (code) => {
    mutation.state = { error: new ApiClientError(code, `server message ${code}`, 401), isPending: false };
    const html = render();
    expect(html).toMatch(new RegExp(`</button><p role="alert"[^>]*>server message ${code}</p>`));
  });
});
