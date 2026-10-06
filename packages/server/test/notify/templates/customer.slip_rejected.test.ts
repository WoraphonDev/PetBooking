import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.slip_rejected.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = {
  bookingNo: "B-1",
  reason: "ยอดไม่ตรง",
  newDeadline: "8 ต.ค. 2569 10:30 น.",
  payUrl: "https://app.test/liff/a/bookings/1/pay",
};

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "สลิปของ B-1 ยังไม่ผ่านการตรวจ: ยอดไม่ตรง\nกรุณาส่งใหม่ภายใน 8 ต.ค. 2569 10:30 น.\nhttps://app.test/liff/a/bookings/1/pay",
    url: "https://app.test/liff/a/bookings/1/pay",
  });
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.slip_rejected", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.slip_rejected"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.slip_rejected"].vars).toEqual(["bookingNo", "reason", "newDeadline", "payUrl"]);
});
