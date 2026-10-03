import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.link_request.ts";

it("matches the 07 text exactly", () => {
  expect(render({ lineName: "Mali 🌼", phone: "081-234-5678" })).toEqual({ text: "Mali 🌼 ขอเชื่อม LINE กับลูกค้าเบอร์ 081-234-5678 — ตรวจสอบ" });
});
it("keeps variable content literal", () => {
  expect(render({ lineName: "{phone} & co", phone: "0812345678" }).text).toBe("{phone} & co ขอเชื่อม LINE กับลูกค้าเบอร์ 0812345678 — ตรวจสอบ");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { lineName: "A", phone: "0812345678" };
  expect(renderTemplate("staff.link_request", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.link_request"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.link_request"].vars).toEqual(["lineName", "phone"]);
});
