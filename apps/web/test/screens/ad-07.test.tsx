import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import HolidaysPage from "../../app/(admin)/admin/holidays/page";
import { HolidayFields, HolidayScreen } from "../../src/components/ad-07/holiday-screen";
import { navigationItems } from "../../src/components/shell-admin/navigation";
import { entry } from "../../src/components/shell-admin/navigation/AD-07";
import messages from "../../src/i18n/messages/th/AD-07.json";

const mock = vi.hoisted(() => ({ date: null as string | null, name: "", setDate: vi.fn(), setName: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    initial === null ? [mock.date, mock.setDate] : initial === "" ? [mock.name, mock.setName] : [initial, vi.fn()],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
afterEach(() => {
  vi.clearAllMocks();
  mock.date = null;
  mock.name = "";
});

it("renders the specified Thai headings and only the two editable fields", () => {
  const html = renderToStaticMarkup(<HolidayScreen />);
  for (const label of ["วันหยุดราชการ", "ปี", "วันที่", "ชื่อวันหยุด"]) expect(html).toContain(label);
  expect(html).toContain('for="holiday-date"');
  expect(html).toContain('id="holiday-date"');
  expect(html).toContain('for="holiday-name"');
  expect(html).toMatch(/<input(?=[^>]*id="holiday-name")(?=[^>]*type="text")[^>]*>/);
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(html).toContain("h-11");
  expect(html).not.toContain("บันทึก");
  expect(html).not.toContain("<form");
});
it("uses the shared Thai date picker to display a local date in Buddhist Era", () => {
  mock.date = "2026-10-02";
  mock.name = "Holiday";
  const html = renderToStaticMarkup(<HolidayScreen />);
  expect(html).toContain("2 ต.ค. 2569");
  expect(html).toContain('value="Holiday"');
});
it("edits a local-date string and name without converting or submitting them", () => {
  const fields = HolidayFields().props.children;
  const date = fields[0].props.children;
  date.props.onValueChange("2026-12-31");
  expect(mock.setDate).toHaveBeenCalledWith("2026-12-31");
  date.props.onValueChange(null);
  expect(mock.setDate).toHaveBeenLastCalledWith(null);
  const name = fields[1].props.children;
  name.props.onChange({ target: { value: "วันหยุด" } } as ChangeEvent<HTMLInputElement>);
  expect(mock.setName).toHaveBeenCalledWith("วันหยุด");
});
it("renders the screen from the catalogued page", () => {
  expect(renderToStaticMarkup(HolidaysPage())).toContain(messages.title);
});
it("enables AD-07 in the existing Admin navigation", () => {
  expect(entry.implemented).toBe(true);
  expect(navigationItems().find((item) => item.id === "AD-07")?.href).toBe("/admin/holidays");
});
