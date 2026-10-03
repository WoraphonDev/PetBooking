import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.booking_rescheduled.ts";

it("matches the 07 text exactly", () => {
  expect(render({ petName: "โมจิ", newDateTime: "ส. 10 ต.ค. 14:30" })).toEqual({ text: "ลูกค้าเลื่อนนัด โมจิ เป็น ส. 10 ต.ค. 14:30" });
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { petName: "โมจิ", newDateTime: "10 ต.ค. 14:30" };
  expect(renderTemplate("staff.booking_rescheduled", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.booking_rescheduled"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.booking_rescheduled"].vars).toEqual(["petName", "newDateTime"]);
});
