import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/admin.feedback.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

// Q-0060: subject is the shop name line.
it("matches the 07 text exactly", () => {
  expect(render({ shopName: "ร้านน้องหมา", message: "อยากให้มีรายงานรายเดือน" })).toEqual({
    subject: "[Feedback] ร้านน้องหมา",
    text: "[Feedback] ร้านน้องหมา: อยากให้มีรายงานรายเดือน",
  });
});
it("keeps multi-line feedback and placeholders literal", () => {
  expect(render({ shopName: "A & B", message: "บรรทัด 1\nบรรทัด 2 {shopName}" }).text).toBe("[Feedback] A & B: บรรทัด 1\nบรรทัด 2 {shopName}");
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  const payload = { shopName: "ร้านน้องหมา", message: "อยากให้มีรายงานรายเดือน" };
  expect(renderTemplate("admin.feedback", payload)).toEqual(render(payload));
  expect(TEMPLATES["admin.feedback"].channels).toEqual(["email"]);
  expect(TEMPLATES["admin.feedback"].vars).toEqual(["shopName", "message"]);
});
