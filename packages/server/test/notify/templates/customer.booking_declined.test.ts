import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.booking_declined.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

it("matches the 07 text with the refund line", () => {
  expect(render({ bookingNo: "B-1", reason: "คิวเต็ม", refundLine: "ร้านจะคืนมัดจำ ฿300 เต็มจำนวน" })).toEqual({
    text: "ขออภัย ร้านไม่สามารถรับการจอง B-1 ได้\nเหตุผล: คิวเต็ม\nร้านจะคืนมัดจำ ฿300 เต็มจำนวน",
  });
});

it("drops the refund line when nothing is returned", () => {
  expect(render({ bookingNo: "B-1", reason: "คิวเต็ม", refundLine: "" }).text).toBe("ขออภัย ร้านไม่สามารถรับการจอง B-1 ได้\nเหตุผล: คิวเต็ม");
});

it("is the dispatcher's renderer, LINE push only", () => {
  const payload = { bookingNo: "B-1", reason: "x", refundLine: "" };
  expect(renderTemplate("customer.booking_declined", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.booking_declined"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.booking_declined"].vars).toEqual(["bookingNo", "reason", "refundLine"]);
});
