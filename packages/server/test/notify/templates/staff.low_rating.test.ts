import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.low_rating.ts";

it("matches the 07 text exactly", () => {
  expect(render({ petName: "โมจิ", rating: 2, feedback: "ตัดขนสั้นเกินไป" })).toEqual({ text: "ลูกค้าให้ 2 ดาว (โมจิ): ตัดขนสั้นเกินไป" });
});
it("keeps variable content literal", () => {
  expect(render({ petName: "ถั่ว", rating: 3, feedback: "{rating} & ok" }).text).toBe("ลูกค้าให้ 3 ดาว (ถั่ว): {rating} & ok");
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  expect(renderTemplate("staff.low_rating", { petName: "โมจิ", rating: 2, feedback: "ตัดขนสั้นเกินไป" })).toEqual(
    render({ petName: "โมจิ", rating: 2, feedback: "ตัดขนสั้นเกินไป" }),
  );
  expect(TEMPLATES["staff.low_rating"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.low_rating"].vars).toEqual(["petName", "rating", "feedback"]);
});
