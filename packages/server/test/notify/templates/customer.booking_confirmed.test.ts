import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.booking_confirmed.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = {
  bookingNo: "B2610-0007",
  summary: "โมจิ: อาบน้ำ",
  dateTime: "7 ต.ค. 2569 10:30 น.",
  shopName: "ร้านน้องหมา",
  bookingUrl: "https://app.test/b/1",
};

it("matches the 07 text exactly and links the booking", () => {
  expect(render(payload)).toEqual({ text: "ยืนยันการจอง B2610-0007 ✅\nโมจิ: อาบน้ำ\n📅 7 ต.ค. 2569 10:30 น.", url: "https://app.test/b/1" });
  expect(render({ ...payload, bookingUrl: "" })).not.toHaveProperty("url");
});

it("is the dispatcher's renderer with the 07 channels and variables", () => {
  expect(renderTemplate("customer.booking_confirmed", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.booking_confirmed"].channels).toEqual(["line_reply", "line_push"]);
  expect(TEMPLATES["customer.booking_confirmed"].vars).toEqual(["bookingNo", "summary", "dateTime", "shopName", "bookingUrl"]);
});
