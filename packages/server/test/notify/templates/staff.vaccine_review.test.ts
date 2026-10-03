import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.vaccine_review.ts";

it("matches the 07 text exactly", () => {
  expect(render({ petName: "โมจิ" })).toEqual({ text: "มีหลักฐานวัคซีนของ โมจิ รอตรวจ" });
});
it("keeps variable content literal", () => {
  expect(render({ petName: "{petName} & งา" }).text).toBe("มีหลักฐานวัคซีนของ {petName} & งา รอตรวจ");
});
it("is the dispatcher's renderer, web_push only, with the specified variable", () => {
  expect(renderTemplate("staff.vaccine_review", { petName: "โมจิ" })).toEqual(render({ petName: "โมจิ" }));
  expect(TEMPLATES["staff.vaccine_review"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.vaccine_review"].vars).toEqual(["petName"]);
});
