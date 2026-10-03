import { expect, it } from "vitest";
import { createFakeEmailSender } from "../../../src/integrations/email/index.ts";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { render } from "../../../src/notify/templates/admin.data_request.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";

it.each(["export", "delete"])("matches the specified PDPA text for %s", (type) => {
  expect(render({ type })).toEqual({ text: `[PDPA] คำขอ ${type} ใหม่` });
});
it("keeps supplied request labels literal", () => {
  expect(render({ type: "ส่งออก {type}" })).toEqual({ text: "[PDPA] คำขอ ส่งออก {type} ใหม่" });
});
it("uses the dispatcher registry and only the specified email channel/variable", () => {
  expect(renderTemplate("admin.data_request", { type: "export" })).toEqual(render({ type: "export" }));
  expect(TEMPLATES["admin.data_request"].channels).toEqual(["email"]);
  expect(TEMPLATES["admin.data_request"].vars).toEqual(["type"]);
});
it("uses the existing subject=text policy without adding request data to the message", async () => {
  const sender = createFakeEmailSender();
  const { text } = render({ type: "delete" });
  await sender.send({ to: "admin@example.test", text });
  expect(sender.outbox).toEqual([{ from: "fake@example.test", to: "admin@example.test", subject: "[PDPA] คำขอ delete ใหม่", text }]);
});
