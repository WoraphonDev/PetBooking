import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.booking_rescheduled.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { petName: "โมจิ", oldDateTime: "7 ต.ค. 10:00 น.", newDateTime: "8 ต.ค. 14:00 น." };

it("matches the 07 text exactly", () => {
  expect(render(payload)).toEqual({ text: "นัดของโมจิถูกเลื่อน\nจาก 7 ต.ค. 10:00 น.\nเป็น 8 ต.ค. 14:00 น." });
});

it("is the dispatcher's renderer, LINE push only", () => {
  expect(renderTemplate("customer.booking_rescheduled", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.booking_rescheduled"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.booking_rescheduled"].vars).toEqual(["petName", "oldDateTime", "newDateTime"]);
});
