import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/owner.support_access.ts";

// Q-0060: fixed email subject.
it("matches the 07 text exactly", () => {
  expect(render({ reason: "ตรวจสอบยอดมัดจำที่ไม่ตรง" })).toEqual({
    subject: "ทีมงานเข้าดูข้อมูลร้านของคุณ",
    text: "ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: ตรวจสอบยอดมัดจำที่ไม่ตรง",
  });
});
it("keeps the reason literal", () => {
  expect(render({ reason: "{reason} & <b>" }).text).toBe("ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: {reason} & <b>");
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  const payload = { reason: "ตรวจสอบยอดมัดจำที่ไม่ตรง" };
  expect(renderTemplate("owner.support_access", payload)).toEqual(render(payload));
  expect(TEMPLATES["owner.support_access"].channels).toEqual(["web_push", "email"]);
  expect(TEMPLATES["owner.support_access"].vars).toEqual(["reason"]);
});
