import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isComplete, resetRequestBody } from "../../src/components/a-02/forgot.ts";
import { ForgotScreen } from "../../src/components/a-02/forgot-screen.tsx";
import messages from "../../src/i18n/messages/th/A-02.json";

type MutationCall = { key: string; options: unknown };
const mutation = vi.hoisted(() => ({ calls: [] as MutationCall[], isSuccess: false }));
vi.mock("../../src/lib/query.ts", () => ({
  ApiQueryProvider: ({ children }: { children: unknown }) => children,
  useApiMutation: (key: string, options: unknown) => {
    mutation.calls.push({ key, options });
    return { isSuccess: mutation.isSuccess, isPending: false, error: null, mutate: vi.fn() };
  },
}));

const render = () =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ "A-02": messages }}>
      <ForgotScreen />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  mutation.calls.length = 0;
  mutation.isSuccess = false;
});

describe("A-02 ลืมรหัสผ่าน", () => {
  it("renders the 06 email field and send-link button; the button needs the required email", () => {
    const html = render();
    for (const label of ["ลืมรหัสผ่าน", "อีเมล", "ส่งลิงก์"]) expect(html).toContain(label);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*required/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain(messages.sent);
    expect(isComplete("")).toBe(false);
    expect(isComplete("  ")).toBe(false);
    expect(isComplete("a@shop.test")).toBe(true);
  });

  it("calls auth.resetRequest with the trimmed lowercase email", () => {
    render();
    expect(mutation.calls[0]?.key).toBe("auth.resetRequest");
    expect(resetRequestBody("  Owner@Shop.TEST ")).toEqual({ email: "owner@shop.test" });
  });

  it("always shows the same message after success", () => {
    mutation.isSuccess = true;
    expect(render()).toMatch(/<p role="status"[^>]*>ถ้ามีบัญชีนี้ เราได้ส่งลิงก์ไปแล้ว<\/p>/);
  });
});
