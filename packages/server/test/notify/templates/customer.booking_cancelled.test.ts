import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.booking_cancelled.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

it("matches the 07 text with reason and money line", () => {
  expect(render({ bookingNo: "B-2", reason: "ลูกค้าขอยกเลิก", moneyLine: "คืนเป็นเครดิต ฿300" })).toEqual({
    text: "การจอง B-2 ถูกยกเลิก\nลูกค้าขอยกเลิก\nคืนเป็นเครดิต ฿300",
  });
});

it("leaves out empty reason / money lines", () => {
  expect(render({ bookingNo: "B-2", reason: "", moneyLine: "" }).text).toBe("การจอง B-2 ถูกยกเลิก");
  expect(render({ bookingNo: "B-2", reason: "ร้านปิด", moneyLine: "" }).text).toBe("การจอง B-2 ถูกยกเลิก\nร้านปิด");
});

it("is the dispatcher's renderer, LINE push only", () => {
  const payload = { bookingNo: "B-2", reason: "r", moneyLine: "m" };
  expect(renderTemplate("customer.booking_cancelled", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.booking_cancelled"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.booking_cancelled"].vars).toEqual(["bookingNo", "reason", "moneyLine"]);
});
