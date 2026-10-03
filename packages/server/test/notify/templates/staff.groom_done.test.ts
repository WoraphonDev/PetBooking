import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.groom_done.ts";

it("matches the 07 groom-done text exactly", () => {
  expect(render({ petName: "โมจิ", groomerName: "พี่นุ่น" })).toEqual({ text: "โมจิ เสร็จแล้ว (พี่นุ่น) — กดแจ้งลูกค้ามารับ" });
});
it("keeps variable content literal", () => {
  expect(render({ petName: "{groomerName}", groomerName: "A & B" }).text).toBe("{groomerName} เสร็จแล้ว (A & B) — กดแจ้งลูกค้ามารับ");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { petName: "โมจิ", groomerName: "นุ่น" };
  expect(renderTemplate("staff.groom_done", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.groom_done"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.groom_done"].vars).toEqual(["petName", "groomerName"]);
});
