import { formatTHB, formatThaiDate } from "@app/domain/format/thai";
import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/owner.daily_summary.ts";

const payload = {
  date: formatThaiDate({ date: "2026-10-04" }),
  groomCount: 12,
  staysInHouse: 5,
  salesTotal: formatTHB({ satang: 1_845_050 }),
  noShows: 1,
  tomorrowCount: 9,
};

it("matches the 07 text with R-31 date/money as the job formats them", () => {
  expect(render(payload).text).toBe(`สรุป ${payload.date}: กรูม 12 ตัว, พัก 5, ยอดขาย ${payload.salesTotal}, no-show 1 | พรุ่งนี้ 9 นัด`);
});
it("uses the Q-0060 subject with the formatted date", () => {
  expect(render(payload).subject).toBe(`สรุปประจำวัน ${payload.date}`);
});
it("renders zero counts as 0, not blank", () => {
  const zero = { ...payload, groomCount: 0, staysInHouse: 0, salesTotal: formatTHB({ satang: 0 }), noShows: 0, tomorrowCount: 0 };
  expect(render(zero).text).toBe(`สรุป ${payload.date}: กรูม 0 ตัว, พัก 0, ยอดขาย ${zero.salesTotal}, no-show 0 | พรุ่งนี้ 0 นัด`);
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  expect(renderTemplate("owner.daily_summary", payload)).toEqual(render(payload));
  expect(TEMPLATES["owner.daily_summary"].channels).toEqual(["web_push", "email"]);
  expect(TEMPLATES["owner.daily_summary"].vars).toEqual(["date", "groomCount", "staysInHouse", "salesTotal", "noShows", "tomorrowCount"]);
});
