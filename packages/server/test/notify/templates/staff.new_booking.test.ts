import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.new_booking.ts";

it("matches the 07 new-booking text exactly", () => {
  expect(render({ bookingNo: "B-0042", customerName: "คุณมะลิ", summary: "อาบน้ำ+ตัดขน โมจิ 5 ต.ค. 10:00" })).toEqual({
    text: "จองใหม่ B-0042 — คุณมะลิ: อาบน้ำ+ตัดขน โมจิ 5 ต.ค. 10:00",
  });
});
it("keeps caller-formatted values literal", () => {
  expect(render({ bookingNo: "B-1", customerName: "{summary} & co", summary: "฿1,200" }).text).toBe("จองใหม่ B-1 — {summary} & co: ฿1,200");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { bookingNo: "B-1", customerName: "A", summary: "S" };
  expect(renderTemplate("staff.new_booking", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.new_booking"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.new_booking"].vars).toEqual(["bookingNo", "customerName", "summary"]);
});
