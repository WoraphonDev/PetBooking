import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.care_task_overdue.ts";

it("matches the 07 overdue-care text exactly", () => {
  expect(render({ title: "ให้ยา", petName: "โมจิ", roomCode: "A2" })).toEqual({ text: "⚠️ เลยเวลา: ให้ยา — โมจิ ห้อง A2" });
});
it("keeps variable content literal", () => {
  expect(render({ title: "{petName}", petName: "ถั่ว & งา", roomCode: "B-01" }).text).toBe("⚠️ เลยเวลา: {petName} — ถั่ว & งา ห้อง B-01");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { title: "ให้อาหาร", petName: "โมจิ", roomCode: "A1" };
  expect(renderTemplate("staff.care_task_overdue", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.care_task_overdue"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.care_task_overdue"].vars).toEqual(["title", "petName", "roomCode"]);
});
