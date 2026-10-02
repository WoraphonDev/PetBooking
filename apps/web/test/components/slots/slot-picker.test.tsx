import { SlotList } from "@app/contracts/dto/slot-list";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  isDayFull,
  isSlotInList,
  SlotPicker,
  type SlotPickerProps,
  slotKey,
  slotTimeLabel,
} from "../../../src/components/shared/slots/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (common as Record<string, string>)[key],
}));

const G1 = "10000000-0000-4000-8000-000000000001";
const G2 = "10000000-0000-4000-8000-000000000002";
const S1 = "20000000-0000-4000-8000-000000000001";
const list = SlotList.parse({
  date: "2026-10-05",
  reason: "ok",
  slots: [
    { startsAt: "2026-10-05T03:00:00.000Z", endsAt: "2026-10-05T04:30:00.000Z", groomerId: G1, groomerName: "พี่ดาว", stationId: S1 },
    { startsAt: "2026-10-05T03:30:00.000Z", endsAt: "2026-10-05T05:00:00.000Z", groomerId: G2, groomerName: "น้องฟ้า", stationId: S1 },
  ],
  durationMinutes: 90,
  priceSatang: 50_000,
});
const reasons = {
  ok: "ว่าง",
  closed: "ร้านปิด",
  past: "วันที่ผ่านมาแล้ว",
  beyond_horizon: "เกินช่วงที่เปิดจอง",
  day_full: "คิววันนี้เต็ม",
  no_capacity: "ไม่มีเวลาว่าง",
} as const;
const onChange = vi.fn();
const onDateChange = vi.fn();
const onRetry = vi.fn();
const props = (extra: Partial<SlotPickerProps> = {}): SlotPickerProps => ({
  days: [{ date: "2026-10-05" }, { date: "2026-10-06", full: true }],
  date: "2026-10-05",
  onDateChange,
  slotList: list,
  timezone: "Asia/Bangkok",
  value: null,
  onChange,
  reasonLabel: (r) => reasons[r],
  fullLabel: "เต็ม",
  ...extra,
});
afterEach(() => vi.clearAllMocks());

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children)];
}
function click(el: ReactElement<Record<string, unknown>> | undefined) {
  if (!el) throw new Error("Missing button");
  (el.props.onClick as () => void)();
}
const buttons = (p: SlotPickerProps, role: "tab" | "option") => elements(SlotPicker(p)).filter((n) => n.props.role === role);

it("renders the day strip in Thai (R-31) and marks a full day", () => {
  const html = renderToStaticMarkup(<SlotPicker {...props()} />);
  expect(html).toContain("จ. 5 ต.ค. 2569");
  expect(html).toContain("อ. 6 ต.ค. 2569");
  expect(html.match(/role="tab"/g)).toHaveLength(2);
  expect(html).toMatch(/aria-selected="true"[^>]*>.*จ\. 5 ต\.ค\. 2569/);
  expect(html).toContain("data-full");
  expect(html).toContain("เต็ม");
});

it("converts slot instants to branch-local times and shows the groomer R-04 picked", () => {
  expect(slotTimeLabel({ startsAt: "2026-10-05T03:00:00.000Z" }, "Asia/Bangkok")).toBe("10:00 น.");
  expect(slotTimeLabel({ startsAt: "2026-10-05T03:00:00.000Z" }, "UTC")).toBe("03:00 น.");
  const html = renderToStaticMarkup(<SlotPicker {...props()} />);
  expect(html).toContain("10:00 น.");
  expect(html).toContain("10:30 น.");
  expect(html).toContain("พี่ดาว");
  expect(html).toContain("น้องฟ้า");
  expect(html.match(/role="option"/g)).toHaveLength(2);
});

it("selects a slot as {startsAt, groomerId, stationId} and highlights the chosen one", () => {
  const second = buttons(props(), "option")[1];
  click(second);
  expect(onChange).toHaveBeenCalledWith({ startsAt: "2026-10-05T03:30:00.000Z", groomerId: G2, stationId: S1 });
  const html = renderToStaticMarkup(
    <SlotPicker {...props({ value: { startsAt: "2026-10-05T03:30:00.000Z", groomerId: G2, stationId: S1 } })} />,
  );
  expect(html.match(/role="option" aria-selected="true"/g)).toHaveLength(1);
});

it("accepts only choices that come from the shown result", () => {
  const first = { startsAt: "2026-10-05T03:00:00.000Z", groomerId: G1, stationId: S1 };
  expect(isSlotInList(list, first)).toBe(true);
  expect(isSlotInList(list, { ...first, groomerId: G2 })).toBe(false);
  expect(isSlotInList(list, { ...first, startsAt: "2026-10-05T03:15:00.000Z" })).toBe(false);
  expect(isSlotInList(list, null)).toBe(false);
  expect(isSlotInList(undefined, first)).toBe(false);
  expect(isSlotInList({ ...list, reason: "closed" }, first)).toBe(false);
  expect(slotKey(first)).toBe(`2026-10-05T03:00:00.000Z|${G1}|${S1}`);
  const html = renderToStaticMarkup(<SlotPicker {...props({ value: { ...first, groomerId: G2 } })} />);
  expect(html.match(/role="option" aria-selected="true"/g)).toBeNull();
});

it("changing day clears the choice; clicking the current day does nothing", () => {
  const [today, tomorrow] = buttons(props(), "tab");
  click(today);
  expect(onDateChange).not.toHaveBeenCalled();
  click(tomorrow);
  expect(onDateChange).toHaveBeenCalledWith("2026-10-06");
  expect(onChange).toHaveBeenCalledWith(null);
});

it.each(["closed", "past", "beyond_horizon", "day_full", "no_capacity"] as const)("shows the full state for reason %s", (reason) => {
  const html = renderToStaticMarkup(<SlotPicker {...props({ slotList: { ...list, reason, slots: [] } })} />);
  expect(html).toContain(reasons[reason]);
  expect(html).not.toContain('role="option"');
});

it("treats an ok day without slots as full (ว่าง/เต็ม)", () => {
  expect(isDayFull(list)).toBe(false);
  expect(isDayFull({ reason: "ok", slots: [] })).toBe(true);
  expect(isDayFull({ reason: "day_full", slots: list.slots })).toBe(true);
  expect(renderToStaticMarkup(<SlotPicker {...props({ slotList: { ...list, slots: [] } })} />)).toContain(reasons.no_capacity);
});

it("ignores a slot list of another day (stale fetch) instead of showing its times", () => {
  const html = renderToStaticMarkup(<SlotPicker {...props({ date: "2026-10-06" })} />);
  expect(html).not.toContain("10:00 น.");
});

it("shows a skeleton while loading and the API error with retry", () => {
  expect(renderToStaticMarkup(<SlotPicker {...props({ isLoading: true })} />)).toContain('aria-busy="true"');
  const html = renderToStaticMarkup(<SlotPicker {...props({ error: "ข้อผิดพลาดจาก API", onRetry })} />);
  expect(html).toContain("ข้อผิดพลาดจาก API");
  expect(html).toContain(common.retry);
  const retry = elements(SlotPicker(props({ error: "x", onRetry }))).find((n) => n.props.onClick === onRetry);
  click(retry);
  expect(onRetry).toHaveBeenCalledOnce();
});

it("disables every button when disabled", () => {
  const html = renderToStaticMarkup(<SlotPicker {...props({ disabled: true })} />);
  expect(html.match(/disabled=""/g)).toHaveLength(4);
});
