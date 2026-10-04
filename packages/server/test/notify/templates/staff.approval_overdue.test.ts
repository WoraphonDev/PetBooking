import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.approval_overdue.ts";

it("matches the 07 text exactly", () => {
  expect(render({ bookingNo: "B-0042", waitedMinutes: 45 })).toEqual({ text: "⏰ B-0042 รออนุมัติมา 45 นาที" });
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { bookingNo: "B-1", waitedMinutes: 30 };
  expect(renderTemplate("staff.approval_overdue", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.approval_overdue"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.approval_overdue"].vars).toEqual(["bookingNo", "waitedMinutes"]);
});
