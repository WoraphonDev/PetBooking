import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.balance_link.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { amount: "฿1,250.00", payUrl: "https://app.test/liff/a/pay/9" };

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "ยอดคงเหลือ ฿1,250.00 ชำระผ่าน PromptPay: https://app.test/liff/a/pay/9",
    url: "https://app.test/liff/a/pay/9",
  });
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.balance_link", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.balance_link"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.balance_link"].vars).toEqual(["amount", "payUrl"]);
});
