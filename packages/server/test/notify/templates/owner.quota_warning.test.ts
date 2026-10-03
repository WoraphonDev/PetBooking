import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/owner.quota_warning.ts";

it("matches the 07 text with the counts the dispatcher sends", () => {
  expect(render({ used: 240, quota: 300 })).toEqual({ text: "ข้อความ LINE ใช้ไป 240/300 แล้ว ระบบจะสงวนโควตาให้ข้อความสำคัญ" });
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  expect(renderTemplate("owner.quota_warning", { used: 1, quota: 1 })).toEqual(render({ used: 1, quota: 1 }));
  expect(TEMPLATES["owner.quota_warning"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["owner.quota_warning"].vars).toEqual(["used", "quota"]);
});
