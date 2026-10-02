import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AnalyticsLayout from "../../../app/(admin)/admin/analytics/layout";
import DataRequestsLayout from "../../../app/(admin)/admin/data-requests/layout";
import FeedbackLayout from "../../../app/(admin)/admin/feedback/layout";
import HolidaysLayout from "../../../app/(admin)/admin/holidays/layout";
import OrganizationsLayout from "../../../app/(admin)/admin/organizations/layout";
import AdminLayout from "../../../app/(admin)/layout";
import messages from "../../i18n/messages/th/shell-admin.json";
import { AdminShell } from "./admin-shell";
import { adminNavigation, navigationItems } from "./navigation";

// These tests exercise shell behavior with an explicit unimplemented-screen fixture.
vi.mock("./navigation/AD-01", () => ({ entry: { id: "AD-01", route: "/admin/login", implemented: false } }));
vi.mock("./navigation/AD-02", () => ({ entry: { id: "AD-02", route: "/admin/organizations", implemented: false } }));
vi.mock("./navigation/AD-03", () => ({ entry: { id: "AD-03", route: "/admin/organizations/[orgId]", implemented: false } }));
vi.mock("./navigation/AD-04", () => ({ entry: { id: "AD-04", route: "/admin/feedback", implemented: false } }));
vi.mock("./navigation/AD-05", () => ({ entry: { id: "AD-05", route: "/admin/data-requests", implemented: false } }));
vi.mock("./navigation/AD-06", () => ({ entry: { id: "AD-06", route: "/admin/analytics", implemented: false } }));
vi.mock("./navigation/AD-07", () => ({ entry: { id: "AD-07", route: "/admin/holidays", implemented: false } }));

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn(), params: {} as { orgId?: string } }));
vi.mock("@app/server/http", () => ({ resolveAdmin: mocks.resolve }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "aid=test", "user-agent": "test" }) }));
vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error("redirect");
  },
}));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useTranslations: () => (id: keyof typeof messages) => messages[id],
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "th", getMessages: async () => ({ "shell-admin": messages }) }));
vi.mock("@/lib/query", () => ({ ApiQueryProvider: ({ children }: { children: React.ReactNode }) => children }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.params = {};
});
const layouts = [OrganizationsLayout, FeedbackLayout, DataRequestsLayout, AnalyticsLayout, HolidaysLayout];

it("keeps the public login parent outside the guard and shell", async () => {
  const html = renderToStaticMarkup(await AdminLayout({ children: <p>login</p> }));
  expect(html).toContain("login");
  expect(html).not.toContain("<nav");
  expect(mocks.resolve).not.toHaveBeenCalled();
});

it.each(layouts)("validates the aid session before rendering each protected root", async (Layout) => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  mocks.resolve.mockResolvedValue({ ctx: { actor: { type: "admin" } } });
  const html = renderToStaticMarkup(await Layout({ children: <p>protected content</p> }));
  expect(html).toContain("protected content");
  expect(html).toContain("<nav");
  const [req, now] = mocks.resolve.mock.calls[0] ?? [];
  expect(req.headers.get("cookie")).toBe("aid=test");
  expect(req.headers.get("user-agent")).toBe("test");
  expect(req.url).toBe("https://app.example.test/");
  expect(now).toBeInstanceOf(Date);
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("redirects an unauthenticated session and propagates other failures", async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  mocks.resolve.mockRejectedValue({ code: "UNAUTHENTICATED" });
  await expect(OrganizationsLayout({ children: <p>secret</p> })).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
  mocks.redirect.mockClear();
  const failure = new Error("database unavailable");
  mocks.resolve.mockRejectedValue(failure);
  await expect(OrganizationsLayout({ children: null })).rejects.toBe(failure);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("renders all catalog labels disabled with mobile and tablet sizing", () => {
  const html = renderToStaticMarkup(<AdminShell>content</AdminShell>);
  for (const label of Object.values(messages)) expect(html).toContain(label);
  expect(html.match(/disabled=""/g)).toHaveLength(7);
  expect(html).not.toContain("href=");
  expect(html).toContain("min-w-[360px]");
  expect(html).toContain("min-h-11");
});

it("enables only implemented screens and never invents an organization for AD-03", () => {
  const enabled = adminNavigation.map((entry) => ({ ...entry, implemented: true }));
  expect(navigationItems(undefined, enabled).find((entry) => entry.id === "AD-03")?.href).toBeNull();
  expect(navigationItems("org/id", enabled).find((entry) => entry.id === "AD-03")?.href).toBe("/admin/organizations/org%2Fid");
  expect(navigationItems(undefined, enabled).find((entry) => entry.id === "AD-02")?.href).toBe("/admin/organizations");
  expect(navigationItems("org", adminNavigation).every((entry) => entry.href === null)).toBe(true);
});
