import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RegisterPage from "../../app/(liff)/liff/[branchSlug]/register/page";
import { draftOf, RegisterForm, RegisterView, registerBody } from "../../src/components/l-01/register-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-01";
import messages from "../../src/i18n/messages/th/L-01.json";

const shop = {
  name: "ร้านหมาน้อย",
  logoUrl: null,
  phone: null,
  address: null,
  province: null,
  latitude: null,
  longitude: null,
  hours: [],
  modules: { grooming: true, hotel: false, daycare: false },
  policyText: null,
  services: [],
  roomTypes: [],
  addFriendUrl: null,
  liffUrl: null,
  liffId: "1234-abcd",
};
const session = {
  registered: false,
  linkPending: false,
  profile: { displayName: "Mali 🌸", pictureUrl: "https://profile.line-scdn.test/mali" },
  customerId: null,
  legalVersions: { privacy: "2026-10-01", terms: "2026-10-01" },
};
const mock = vi.hoisted(() => ({
  data: undefined as unknown,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  replace: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    mock.states.length ? mock.states.shift() : typeof initial === "function" ? (initial as () => unknown)() : initial,
    mock.setState,
  ],
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    String(messages[key as never]).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? ""),
}));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
beforeEach(() => {
  vi.stubGlobal("window", { location: { href: "https://liff.test/liff/shop-a/register", replace: mock.replace } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mock.data = undefined;
  mock.pending = false;
  mock.states = [];
});
const submit = (draft: ReturnType<typeof draftOf>) => {
  mock.states = [draft, {}, false];
  return RegisterForm({ shop, session, branchSlug: "shop-a" }).props.onSubmit({ preventDefault: vi.fn() });
};
const filled = () => ({ ...draftOf(session), phone: "+66812345678", privacy: true, terms: true });

it("loads public.branch + liff.session, shows a skeleton until the LINE session is back; L-01 is live", async () => {
  mock.data = shop;
  const html = renderToStaticMarkup(await RegisterPage({ params: Promise.resolve({ branchSlug: "shop-a" }) }));
  expect(html).toContain('aria-busy="true"');
  expect(mock.query).toHaveBeenCalledWith("public.branch", expect.objectContaining({ params: { bookingSlug: "shop-a" } }));
  expect(entry.implemented).toBe(true);
});

it("shows every L-01 field: shop, LINE name, ชื่อ (prefilled from LINE), นามสกุล, ชื่อเล่น, เบอร์โทร, the 3 consents, เริ่มใช้งาน", () => {
  const html = renderToStaticMarkup(<RegisterForm shop={shop} session={session} branchSlug="shop-a" />);
  for (const key of [
    "shopName",
    "lineName",
    "firstName",
    "lastName",
    "nickname",
    "phone",
    "privacy",
    "readPrivacy",
    "terms",
    "photoConsent",
    "submit",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("ยินดีต้อนรับสู่ ร้านหมาน้อย");
  expect(html).toContain('value="Mali 🌸"');
  expect(html).toContain('src="https://profile.line-scdn.test/mali"');
  expect(html).toContain('type="tel"');
  expect(html).toContain('href="/legal/privacy"');
});

it("เริ่มใช้งาน sends liff.register with the latest legal versions, then opens L-02", async () => {
  mock.mutate.mockResolvedValue({ ...session, registered: true, customerId: "c1" });
  await submit({ ...filled(), lastName: "ใจดี", photoConsent: true });
  expect(mock.mutation).toHaveBeenCalledWith("liff.register", expect.anything());
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a" },
    body: {
      firstName: "Mali 🌸",
      lastName: "ใจดี",
      phone: "+66812345678",
      privacyVersion: "2026-10-01",
      termsVersion: "2026-10-01",
      photoConsent: true,
    },
  });
  expect(mock.replace).toHaveBeenCalledWith("/liff/shop-a");
});

it("a phone match → 'ร้านกำลังตรวจสอบประวัติเดิมของคุณ' instead of L-02", async () => {
  mock.mutate.mockResolvedValue({ ...session, linkPending: true });
  await submit(filled());
  expect(mock.setState).toHaveBeenCalledWith(true);
  expect(mock.replace).not.toHaveBeenCalled();
  mock.states = [filled(), {}, true];
  expect(renderToStaticMarkup(<RegisterForm shop={shop} session={session} branchSlug="shop-a" />)).toContain(messages.linkPending);
  expect(renderToStaticMarkup(<RegisterView shop={shop} session={{ ...session, linkPending: true }} branchSlug="shop-a" />)).toContain(
    messages.linkPending,
  );
});

it("ชื่อ, เบอร์โทร and both required consents are checked before sending", async () => {
  await submit({ ...filled(), firstName: "" });
  await submit({ ...filled(), phone: null });
  await submit({ ...filled(), phoneError: true });
  await submit({ ...filled(), privacy: false });
  await submit({ ...filled(), terms: false });
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setState).toHaveBeenCalledWith({ privacy: messages.mustAccept });
});

it("an API error (e.g. LINK_REQUEST_PENDING) is shown as a toast", async () => {
  const { ApiClientError } = await import("../../src/lib/api");
  mock.mutate.mockRejectedValue(new ApiClientError("LINK_REQUEST_PENDING", "มีคำขอจับคู่บัญชีรอร้านยืนยันอยู่", 409));
  await submit(filled());
  expect(mock.toast.error).toHaveBeenCalledWith("มีคำขอจับคู่บัญชีรอร้านยืนยันอยู่");
});

it("registerBody leaves out empty optional names", () => {
  expect(registerBody(session, filled())).toEqual({
    firstName: "Mali 🌸",
    phone: "+66812345678",
    privacyVersion: "2026-10-01",
    termsVersion: "2026-10-01",
    photoConsent: false,
  });
});
