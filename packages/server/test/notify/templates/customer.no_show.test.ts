import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.no_show.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { petName: "โมจิ", moneyLine: "มัดจำ ฿300 ถูกริบตามนโยบายร้าน", bookAgainUrl: "https://app.test/liff/a" };

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "วันนี้ไม่พบโมจิตามนัด มัดจำ ฿300 ถูกริบตามนโยบายร้าน\nนัดใหม่ได้ที่ https://app.test/liff/a",
    url: "https://app.test/liff/a",
  });
});
it("nothing forfeited: no trailing space after ตามนัด", () => {
  expect(render({ ...payload, moneyLine: "" }).text).toBe("วันนี้ไม่พบโมจิตามนัด\nนัดใหม่ได้ที่ https://app.test/liff/a");
});
it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.no_show", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.no_show"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.no_show"].vars).toEqual(["petName", "moneyLine", "bookAgainUrl"]);
});
