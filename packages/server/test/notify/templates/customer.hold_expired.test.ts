import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.hold_expired.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { bookingNo: "B-2", bookAgainUrl: "https://app.test/liff/a" };

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "หมดเวลาชำระมัดจำ B-2 คิวถูกปล่อยแล้ว\nจองใหม่: https://app.test/liff/a",
    url: "https://app.test/liff/a",
  });
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.hold_expired", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.hold_expired"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.hold_expired"].vars).toEqual(["bookingNo", "bookAgainUrl"]);
});
