import type { PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "../../i18n/messages/th/shell-liff.json";
import { LiffForbidden, LiffShell, LiffSignIn } from "./liff-shell";

const nav = vi.hoisted(() => ({ pathname: "/liff/shop-a", replace: vi.fn(), refresh: vi.fn(), effects: [] as (() => void)[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => String(messages[key as never]) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (fn: () => void) => nav.effects.push(fn),
}));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/liff", () => ({ liffSignIn: signIn }));

const shop = (over: Partial<PublicBranchResponse> = {}) =>
  ({
    name: "ร้านน้องหมา",
    logoUrl: null,
    modules: { grooming: true, hotel: false, daycare: false },
    liffId: "2011-abc",
    ...over,
  }) as PublicBranchResponse;
const runEffects = () => {
  for (const fn of nav.effects.splice(0)) fn();
};

beforeEach(() => {
  nav.pathname = "/liff/shop-a";
  nav.effects = [];
  vi.clearAllMocks();
});

it("ready: shop header, module-aware menu (disabled until each screen ships) and the page", () => {
  const html = renderToStaticMarkup(
    <LiffShell branchSlug="shop-a" shop={shop()} state="ready" fake={false}>
      <p>page</p>
    </LiffShell>,
  );
  expect(html).toContain("ร้านน้องหมา");
  for (const id of ["L-02", "L-03", "L-04", "L-08", "L-12", "L-15"] as const) expect(html).toContain(messages[id]);
  expect(html).not.toContain(messages["L-05"]);
  expect(html).toContain("disabled");
  expect(html).toContain("page");
});

it("register: other pages redirect to L-01 and hide the page; L-01 itself renders", () => {
  const html = renderToStaticMarkup(
    <LiffShell branchSlug="shop-a" shop={shop()} state="register" fake={false}>
      <p>page</p>
    </LiffShell>,
  );
  expect(html).not.toContain("page");
  runEffects();
  expect(nav.replace).toHaveBeenCalledWith("/liff/shop-a/register");
  nav.pathname = "/liff/shop-a/register";
  expect(
    renderToStaticMarkup(
      <LiffShell branchSlug="shop-a" shop={shop()} state="register" fake={false}>
        <p>page</p>
      </LiffShell>,
    ),
  ).toContain("page");
});

it("signin: runs liff sign-in with the shop's liffId and refreshes the guard after liff.session", async () => {
  signIn.mockResolvedValue({ registered: true });
  const html = renderToStaticMarkup(<LiffSignIn branchSlug="shop-a" liffId="2011-abc" fake={false} />);
  expect(html).toContain(messages.signingIn);
  vi.stubGlobal("window", { location: { href: "https://app.test/liff/shop-a" } });
  runEffects();
  await vi.waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  expect(signIn).toHaveBeenCalledWith({ branchSlug: "shop-a", liffId: "2011-abc", fake: false, href: "https://app.test/liff/shop-a" });
  vi.unstubAllGlobals();
});

it("signin without a LINE channel shows LINE_NOT_CONNECTED; 403 view shows FORBIDDEN", () => {
  expect(renderToStaticMarkup(<LiffSignIn branchSlug="shop-a" liffId={null} fake={false} />)).toContain(
    ERROR_MESSAGE_TH.LINE_NOT_CONNECTED,
  );
  expect(renderToStaticMarkup(<LiffForbidden />)).toContain(ERROR_MESSAGE_TH.FORBIDDEN);
});
