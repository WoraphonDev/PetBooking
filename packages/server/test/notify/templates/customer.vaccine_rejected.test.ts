import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/customer.vaccine_rejected.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const payload = { petName: "โมจิ", vaccineName: "พิษสุนัขบ้า", reason: "รูปไม่ชัด", petUrl: "https://app.test/liff/a/pets/5" };

it("matches the 07 text exactly and links the LIFF page", () => {
  expect(render(payload)).toEqual({
    text: "หลักฐานวัคซีน พิษสุนัขบ้า ของโมจิยังไม่ผ่าน: รูปไม่ชัด\nส่งใหม่: https://app.test/liff/a/pets/5",
    url: "https://app.test/liff/a/pets/5",
  });
});

it("is the dispatcher's renderer, LINE push only, with the 07 variables", () => {
  expect(renderTemplate("customer.vaccine_rejected", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.vaccine_rejected"].channels).toEqual(["line_push"]);
  expect(TEMPLATES["customer.vaccine_rejected"].vars).toEqual(["petName", "vaccineName", "reason", "petUrl"]);
});
