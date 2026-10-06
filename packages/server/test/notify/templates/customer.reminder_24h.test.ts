import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.reminder_24h.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { petName: "โมจิ", dateTime: "8 ต.ค. 10:00 น.", service: "อาบน้ำ", bookingUrl: "https://app.test/liff/a/bookings/3" };

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "พรุ่งนี้ 8 ต.ค. 10:00 น. มีนัดอาบน้ำของโมจิ 🐶\nเลื่อน/ยกเลิก: https://app.test/liff/a/bookings/3",
    url: "https://app.test/liff/a/bookings/3",
  });
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.reminder_24h", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.reminder_24h"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.reminder_24h"].vars).toEqual(["petName", "dateTime", "service", "bookingUrl"]);
});
