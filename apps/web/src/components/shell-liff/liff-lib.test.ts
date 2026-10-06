import { afterEach, expect, it, vi } from "vitest";
import { liffIdToken, liffSignIn } from "../../lib/liff";

const sdk = vi.hoisted(() => ({ init: vi.fn(), isLoggedIn: vi.fn(), login: vi.fn(), getIDToken: vi.fn() }));
vi.mock("@line/liff", () => ({ default: sdk }));
const api = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ api }));

afterEach(() => vi.clearAllMocks());

it("LINE_FAKE: fake token from ?fakeUser (default user otherwise), no SDK", async () => {
  expect(await liffIdToken({ liffId: "x", fake: true, href: "https://app.test/liff/a?fakeUser=U123" })).toBe("fake:U123:ลูกค้าทดสอบ");
  expect(await liffIdToken({ liffId: "x", fake: true, href: "https://app.test/liff/a" })).toBe("fake:Udevcustomer:ลูกค้าทดสอบ");
  expect(sdk.init).not.toHaveBeenCalled();
});

it("real LIFF: init with the liffId, login redirect when signed out, else the ID token", async () => {
  sdk.isLoggedIn.mockReturnValueOnce(false);
  expect(await liffIdToken({ liffId: "2011-abc", fake: false, href: "https://app.test/liff/a" })).toBeNull();
  expect(sdk.init).toHaveBeenCalledWith({ liffId: "2011-abc" });
  expect(sdk.login).toHaveBeenCalledWith({ redirectUri: "https://app.test/liff/a" });
  sdk.isLoggedIn.mockReturnValueOnce(true);
  sdk.getIDToken.mockReturnValueOnce("id-token");
  expect(await liffIdToken({ liffId: "2011-abc", fake: false, href: "https://app.test/liff/a" })).toBe("id-token");
});

it("liffSignIn posts the token to liff.session of the branch", async () => {
  api.mockResolvedValue({ registered: false });
  await liffSignIn({ branchSlug: "shop-a", liffId: "x", fake: true, href: "https://app.test/liff/shop-a" });
  expect(api).toHaveBeenCalledWith(
    "liff.session",
    expect.objectContaining({ params: { branchSlug: "shop-a" }, body: { idToken: "fake:Udevcustomer:ลูกค้าทดสอบ" } }),
  );
});
