import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { depositLine, render } from "../../../src/notify/templates/customer.booking_received.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

const base = {
  shopName: "ร้านน้องหมา",
  bookingNo: "B2610-0007",
  summary: "โมจิ: อาบน้ำ, ตัดเล็บ",
  bookingUrl: "https://app.test/liff/shop-a/bookings/b1",
};

it("with a deposit: 07 text with the composed deposit line (R-31 money, branch-local HH:mm) and the booking link", () => {
  // 03:30Z = 10:30 Bangkok
  expect(render({ ...base, depositAmount: 35_000, holdExpiresTime: "2026-10-07T03:30:00.000Z" })).toEqual({
    text: "ได้รับการจอง B2610-0007 แล้ว 🐾\nโมจิ: อาบน้ำ, ตัดเล็บ\nกรุณาชำระมัดจำ ฿350 ภายใน 10:30 น. เพื่อยืนยันคิว\nดูรายละเอียด: https://app.test/liff/shop-a/bookings/b1",
    url: "https://app.test/liff/shop-a/bookings/b1",
  });
});

it("without a deposit (0 or missing): the 'shop will confirm soon' line (07 §1.2)", () => {
  expect(depositLine(0, "")).toBe("ร้านจะยืนยันคิวให้เร็ว ๆ นี้ค่ะ");
  expect(depositLine(undefined, undefined)).toBe("ร้านจะยืนยันคิวให้เร็ว ๆ นี้ค่ะ");
  expect(render({ ...base, depositAmount: 0, holdExpiresTime: "" }).text.split("\n")[2]).toBe("ร้านจะยืนยันคิวให้เร็ว ๆ นี้ค่ะ");
  expect(depositLine(12_345, "2026-10-07T03:30:00.000Z")).toBe("กรุณาชำระมัดจำ ฿123.45 ภายใน 10:30 น. เพื่อยืนยันคิว");
});

it("is the dispatcher's renderer with the 07 channels and variables", () => {
  const payload = { ...base, depositAmount: 0, holdExpiresTime: "" };
  expect(renderTemplate("customer.booking_received", payload)).toEqual(render(payload));
  expect(TEMPLATES["customer.booking_received"].channels).toEqual(["line_reply", "line_push"]);
  expect(TEMPLATES["customer.booking_received"].vars).toEqual([
    "shopName",
    "bookingNo",
    "summary",
    "depositAmount",
    "holdExpiresTime",
    "bookingUrl",
  ]);
});
