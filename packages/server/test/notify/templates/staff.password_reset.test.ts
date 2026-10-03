import { expect, it } from "vitest";
import { createFakeEmailSender } from "../../../src/integrations/email/index.ts";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.password_reset.ts";

it("matches the Thai reset text, 30-minute expiry and the Q-0060 subject exactly", () => {
  expect(render({ resetUrl: "https://shop.test/reset/token-1" })).toEqual({
    subject: "ตั้งรหัสผ่านใหม่",
    text: "ตั้งรหัสผ่านใหม่: https://shop.test/reset/token-1 (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้",
  });
});
it("keeps the URL literal (no placeholder interpretation)", () => {
  expect(render({ resetUrl: "https://shop.test/reset/{resetUrl}?a=1&b=2" }).text).toBe(
    "ตั้งรหัสผ่านใหม่: https://shop.test/reset/{resetUrl}?a=1&b=2 (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้",
  );
});
it("is the renderer the dispatcher uses, email-only with exactly the resetUrl variable", () => {
  const payload = { resetUrl: "https://shop.test/reset/x" };
  expect(renderTemplate("staff.password_reset", payload)).toEqual(render(payload));
  expect(TEMPLATES["staff.password_reset"].channels).toEqual(["email"]);
  expect(TEMPLATES["staff.password_reset"].vars).toEqual(["resetUrl"]);
});
it("goes out with its subject through the email adapter", async () => {
  const sender = createFakeEmailSender();
  const { subject, text } = render({ resetUrl: "https://shop.test/reset/x" });
  await sender.send({ to: "staff@example.test", subject, text });
  expect(sender.outbox).toEqual([{ from: "fake@example.test", to: "staff@example.test", subject: "ตั้งรหัสผ่านใหม่", text }]);
});
