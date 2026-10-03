import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.report_card_review.ts";

it("matches the 07 text exactly", () => {
  expect(render({ petName: "โมจิ" })).toEqual({ text: "Report card ของ โมจิ รอตรวจ" });
});
it("keeps variable content literal", () => {
  expect(render({ petName: "{petName} & งา" }).text).toBe("Report card ของ {petName} & งา รอตรวจ");
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  expect(renderTemplate("staff.report_card_review", { petName: "โมจิ" })).toEqual(render({ petName: "โมจิ" }));
  expect(TEMPLATES["staff.report_card_review"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.report_card_review"].vars).toEqual(["petName"]);
});
