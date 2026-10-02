import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import HolidaysPage from "../../app/(admin)/admin/holidays/page";
import { HolidayEditor, HolidayFields, HolidayScreen } from "../../src/components/ad-07/holiday-screen";
import { navigationItems } from "../../src/components/shell-admin/navigation";
import { entry } from "../../src/components/shell-admin/navigation/AD-07";
import messages from "../../src/i18n/messages/th/AD-07.json";

const mock = vi.hoisted(() => ({
  year: 2026,
  days: [{ date: "2026-10-02", nameTh: "Holiday" }],
  error: "",
  saved: false,
  setYear: vi.fn(),
  setDays: vi.fn(),
  setError: vi.fn(),
  setSaved: vi.fn(),
  mutate: vi.fn(),
  pending: false,
  loading: false,
  loadError: false,
  query: vi.fn(),
  refetch: vi.fn(),
  change: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    typeof initial === "function"
      ? [mock.days, mock.setDays]
      : typeof initial === "number"
        ? [mock.year, mock.setYear]
        : initial === ""
          ? [mock.error, mock.setError]
          : [false, mock.setSaved],
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: keyof typeof messages) => messages[key],
  useNow: () => new Date("2026-10-02T00:00:00Z"),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: mock.days, isPending: mock.loading, isError: mock.loadError, error: null, refetch: mock.refetch };
  },
  useApiMutation: () => ({ mutateAsync: mock.mutate, isPending: mock.pending }),
}));
const fields = () => HolidayFields({ id: "holiday", day: mock.days[0] ?? { date: "", nameTh: "" }, onChange: mock.change });
const editor = () => HolidayEditor({ year: mock.year, initialDays: mock.days });
afterEach(() => {
  vi.clearAllMocks();
  mock.days = [{ date: "2026-10-02", nameTh: "Holiday" }];
  mock.year = 2026;
  mock.error = "";
  mock.pending = false;
  mock.loading = false;
  mock.loadError = false;
  mock.mutate.mockReset();
});

it("renders the two specified editable row fields", () => {
  const html = renderToStaticMarkup(fields());
  for (const label of ["วันที่", "ชื่อวันหยุด"]) expect(html).toContain(label);
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
  const html = renderToStaticMarkup(fields());
  expect(html).toContain("2 ต.ค. 2569");
  expect(html).toContain('value="Holiday"');
});
it("edits a local-date string and name without converting or submitting them", () => {
  const controls = fields().props.children;
  const date = controls[0].props.children;
  date.props.onValueChange("2026-12-31");
  expect(mock.change).toHaveBeenCalledWith({ date: "2026-12-31", nameTh: "Holiday" });
  date.props.onValueChange(null);
  expect(mock.change).toHaveBeenLastCalledWith({ date: "", nameTh: "Holiday" });
  const name = controls[1].props.children;
  name.props.onChange({ target: { value: "วันหยุด" } } as ChangeEvent<HTMLInputElement>);
  expect(mock.change).toHaveBeenCalledWith({ date: "2026-10-02", nameTh: "วันหยุด" });
});
it("renders the screen from the catalogued page", () => {
  expect(renderToStaticMarkup(HolidaysPage())).toContain(messages.title);
});
it("enables AD-07 in the existing Admin navigation", () => {
  expect(entry.implemented).toBe(true);
  expect(navigationItems().find((item) => item.id === "AD-07")?.href).toBe("/admin/holidays");
});

it("loads the selected year and shows all annual rows with add/remove/save controls", () => {
  mock.days.push({ date: "2026-12-31", nameTh: "วันสิ้นปี" });
  const html = renderToStaticMarkup(<HolidayScreen />);
  for (const label of [messages.title, messages.yearLabel, messages.add, messages.remove, messages.save, "Holiday", "วันสิ้นปี"])
    expect(html).toContain(label);
  expect(mock.query).toHaveBeenCalledWith("admin.listHolidays", expect.objectContaining({ params: { year: "2026" } }), expect.anything());
  const year = HolidayScreen().props.children[1].props.children[1].props.children;
  year.props.onChange({ target: { value: "2027" } });
  expect(mock.setYear).toHaveBeenCalledWith(2027);
});
it.each(["loading", "loadError"] as const)("blocks replacement until loading succeeds: %s", (state) => {
  mock[state] = true;
  const html = renderToStaticMarkup(<HolidayScreen />);
  expect(html).not.toContain("<form");
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(mock.mutate).not.toHaveBeenCalled();
});
it("adds, removes and edits draft rows", () => {
  const nodes = editor().props.children;
  nodes[3].props.onClick();
  expect(mock.setDays.mock.calls[0]?.[0](mock.days)).toHaveLength(2);
  const row = nodes[2].props.children[1][0];
  row.props.children[1].props.onClick();
  expect(mock.setDays.mock.calls[1]?.[0](mock.days)).toEqual([]);
  row.props.children[0].props.onChange({ date: "2026-12-31", nameTh: "วันสิ้นปี" });
  expect(mock.setDays.mock.calls[2]?.[0](mock.days)).toEqual([{ date: "2026-12-31", nameTh: "วันสิ้นปี" }]);
});
it("saves the complete year, supports clearing it and preserves a failed draft", async () => {
  mock.days.push({ date: "2026-12-31", nameTh: "วันสิ้นปี" });
  const submit = () => editor().props.onSubmit({ preventDefault: vi.fn() });
  await submit();
  expect(mock.mutate).toHaveBeenCalledWith({ params: { year: "2026" }, body: { days: mock.days } });
  expect(mock.setSaved).toHaveBeenCalledWith(true);
  mock.mutate.mockRejectedValueOnce(new Error("failed"));
  await submit();
  expect(mock.setError).toHaveBeenCalledWith(expect.any(String));
  expect(mock.days).toHaveLength(2);
  mock.days = [];
  await submit();
  expect(mock.mutate).toHaveBeenLastCalledWith({ params: { year: "2026" }, body: { days: [] } });
});
it("rejects duplicate dates, wrong years, empty names and pending resubmission", async () => {
  for (const days of [[{ date: "2027-01-01", nameTh: "Wrong" }], [{ date: "2026-01-01", nameTh: " " }], [mock.days[0], mock.days[0]]]) {
    mock.days = days as typeof mock.days;
    await editor().props.onSubmit({ preventDefault: vi.fn() });
    expect(mock.mutate).not.toHaveBeenCalled();
    expect(mock.setError).toHaveBeenCalledWith(messages.validation);
  }
  mock.pending = true;
  mock.days = [{ date: "2026-01-01", nameTh: "Valid" }];
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});

it("allows typing a partial year but does not load or enable replacement until the year is valid", () => {
  const input = HolidayScreen().props.children[1].props.children[1].props.children;
  input.props.onChange({ target: { value: "2" } });
  expect(mock.setYear).toHaveBeenCalledWith(2);
  mock.year = 2;
  const html = renderToStaticMarkup(<HolidayScreen />);
  expect(html).toContain(messages.yearValidation);
  expect(html).not.toContain("<form");
  expect(mock.query).toHaveBeenCalledWith("admin.listHolidays", expect.anything(), expect.objectContaining({ enabled: false }));
});
