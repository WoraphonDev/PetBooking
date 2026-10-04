import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.booking_cancelled.ts";

it("matches the 07 text with the Q-0088 late marker", () => {
  expect(render({ bookingNo: "B-0042", customerName: "คุณมะลิ", isLate: "(ยกเลิกกระชั้น)" })).toEqual({
    text: "ลูกค้ายกเลิก B-0042 (คุณมะลิ) (ยกเลิกกระชั้น)",
  });
});
it("drops the trailing space when the cancel is not late (Q-0088)", () => {
  expect(render({ bookingNo: "B-0042", customerName: "คุณมะลิ", isLate: "" }).text).toBe("ลูกค้ายกเลิก B-0042 (คุณมะลิ)");
});
it("is the dispatcher's renderer, web_push only, with the specified variables", () => {
  const payload = { bookingNo: "B-1", customerName: "A", isLate: "" };
  expect(renderTemplate("staff.booking_cancelled", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.booking_cancelled"].channels).toEqual(["web_push"]);
  expect(TEMPLATES["staff.booking_cancelled"].vars).toEqual(["bookingNo", "customerName", "isLate"]);
});
