import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.slip_submitted.ts";

it("matches the 07 text with the Q-0088 duplicate flag", () => {
  expect(render({ bookingNo: "B-0042", amount: "฿300", duplicateFlag: "⚠️ สลิปนี้เคยใช้แล้ว" })).toEqual({
    text: "สลิปใหม่ B-0042 ฿300 ⚠️ สลิปนี้เคยใช้แล้ว",
  });
});
it("drops the trailing space when the slip is not a duplicate (Q-0088)", () => {
  expect(render({ bookingNo: "B-0042", amount: "฿1,250.50", duplicateFlag: "" }).text).toBe("สลิปใหม่ B-0042 ฿1,250.50");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { bookingNo: "B-1", amount: "฿300", duplicateFlag: "" };
  expect(renderTemplate("staff.slip_submitted", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.slip_submitted"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.slip_submitted"].vars).toEqual(["bookingNo", "amount", "duplicateFlag"]);
});
