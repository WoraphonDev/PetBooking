import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ConsoleGroupLayout from "../../../app/(console)/layout";
import messages from "../../i18n/messages/th/shell-console.json";
import { ConsoleShell } from "./console-shell";

const mocks = vi.hoisted(() => ({ pathname: "/console/customers" }));
vi.mock("./navigation/C-01", () => ({ entry: { id: "C-01", route: "/console", implemented: true } }));
vi.mock("./navigation/C-02", () => ({ entry: { id: "C-02", route: "/console/calendar", implemented: false } }));
vi.mock("./navigation/C-08", () => ({ entry: { id: "C-08", route: "/console/customers", implemented: true } }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useTranslations: () => (id: keyof typeof messages) => messages[id],
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "th", getMessages: async () => ({ "shell-console": messages }) }));
vi.mock("@/lib/query", () => ({ ApiQueryProvider: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => {
  mocks.pathname = "/console/customers";
});
const render = (role: "owner" | "front_desk" | "staff", supportMode = false) =>
  renderToStaticMarkup(
    <ConsoleShell role={role} supportMode={supportMode} shopName="Pilot Shop">
      <p>page content</p>
    </ConsoleShell>,
  );

it("keeps the (console) group layout to providers only", async () => {
  const html = renderToStaticMarkup(await ConsoleGroupLayout({ children: <p>child</p> }));
  expect(html).toBe("<p>child</p>");
});

it("renders the role's menu with implemented links and disabled entries", () => {
  const html = render("owner");
  expect(html).toContain("Pilot Shop");
  expect(html).toContain('href="/console/customers"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain(messages["C-23"]);
  expect(html).toContain('href="/console"');
  expect(html).toMatch(new RegExp(`disabled=""[^>]*>${messages["C-02"].replace(/[()]/g, "\\$&")}<`));
  expect(html).toContain("page content");
  expect(render("front_desk")).not.toContain(messages["C-23"]);
});

it("marks the dashboard link as the current page", () => {
  mocks.pathname = "/console";
  const html = render("owner");
  const dashboardLink = html.match(/<a[^>]*href="\/console"[^>]*>/)?.[0];
  expect(dashboardLink).toContain('aria-current="page"');
});

it("shows the 403 view instead of a page the role may not open", () => {
  mocks.pathname = "/console/reports/sales";
  const html = render("front_desk");
  expect(html).toContain("403");
  expect(html).toContain(ERROR_MESSAGE_TH.FORBIDDEN);
  expect(html).not.toContain("page content");
  expect(render("owner")).toContain("page content");
});

it("shows the red support-mode banner only in support mode", () => {
  expect(render("owner", true)).toContain(messages.supportBanner);
  expect(render("owner", true)).toContain("bg-destructive");
  expect(render("owner")).not.toContain(messages.supportBanner);
});
