import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.link_approved.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

it("matches the 07 text exactly", () => {
  expect(render({ shopName: "น้องหมาสปา" })).toEqual({ text: "ร้านน้องหมาสปาเชื่อมบัญชี LINE กับประวัติเดิมของคุณแล้ว ✅" });
});

it("keeps the shop name literal", () => {
  expect(render({ shopName: "{shopName} & Co" }).text).toBe("ร้าน{shopName} & Coเชื่อมบัญชี LINE กับประวัติเดิมของคุณแล้ว ✅");
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.link_approved", { shopName: "A" })).toEqual(render({ shopName: "A" }));
  expect(TEMPLATES["customer.link_approved"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.link_approved"].vars).toEqual(["shopName"]);
});
