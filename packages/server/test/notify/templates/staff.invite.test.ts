import { expect, it } from "vitest";
import { createFakeEmailSender } from "../../../src/integrations/email/index.ts";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/staff.invite.ts";

it("matches the Thai invite text and seven-day expiry exactly", () => {
  expect(render({ shopName: "ร้านน้องหมา", inviteUrl: "https://shop.test/invite/test-token" })).toEqual({
    text: "คุณได้รับเชิญเข้าร่วมร้าน ร้านน้องหมา — https://shop.test/invite/test-token (หมดอายุใน 7 วัน)",
  });
});
it("preserves variable content without interpreting placeholders or special characters", () => {
  expect(render({ shopName: "ร้าน {inviteUrl} & Friends", inviteUrl: "https://shop.test/invite/token?x=1&y=2" }).text).toBe(
    "คุณได้รับเชิญเข้าร่วมร้าน ร้าน {inviteUrl} & Friends — https://shop.test/invite/token?x=1&y=2 (หมดอายุใน 7 วัน)",
  );
});
it("uses the same renderer through the dispatcher registry", () => {
  const payload = { shopName: "Pilot", inviteUrl: "https://shop.test/invite/example" };
  expect(renderTemplate("staff.invite", payload)).toEqual(render(payload));
});
it("is email-only with precisely the specified payload variables", () => {
  expect(TEMPLATES["staff.invite"].channels).toEqual(["email"]);
  expect(TEMPLATES["staff.invite"].vars).toEqual(["shopName", "inviteUrl"]);
});
it("delivers identical subject and text through the existing email adapter (Q-0060)", async () => {
  const sender = createFakeEmailSender();
  const { text } = render({ shopName: "Pilot", inviteUrl: "https://shop.test/invite/example" });
  await sender.send({ to: "staff@example.test", text });
  expect(sender.outbox).toEqual([{ from: "fake@example.test", to: "staff@example.test", subject: text, text }]);
});
