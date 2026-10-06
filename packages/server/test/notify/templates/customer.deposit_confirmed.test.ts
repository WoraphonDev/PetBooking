import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.deposit_confirmed.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

it("matches the 07 text exactly", () => {
  expect(render({ bookingNo: "B-3", amount: "฿300" })).toEqual({ text: "ได้รับมัดจำ ฿300 สำหรับ B-3 แล้ว ขอบคุณค่ะ" });
});

it("is the dispatcher's renderer, LINE push only", () => {
  const payload = { bookingNo: "B-3", amount: "฿1" };
  expect(renderTemplate("customer.deposit_confirmed", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.deposit_confirmed"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.deposit_confirmed"].vars).toEqual(["bookingNo", "amount"]);
});
