import { expect, it } from "vitest";
import { TEMPLATES } from "../../../src/notify/keys.ts";
import { renderTemplate } from "../../../src/notify/templates/index.ts";
import { render } from "../../../src/notify/templates/owner.promptpay_changed.ts";

// Body text only: the email subject belongs to T-0320 (Q-0060).
it("matches the 07 text exactly", () => {
  expect(render({ byName: "คุณเอ", idMasked: "xxx-xxx-5678" }).text).toBe(
    "⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น xxx-xxx-5678 โดย คุณเอ — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที",
  );
});
it("keeps variable content literal", () => {
  expect(render({ byName: "{idMasked}", idMasked: "x-1234" }).text).toBe(
    "⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น x-1234 โดย {idMasked} — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที",
  );
});
it("is the dispatcher's renderer with the specified channels and variables", () => {
  const payload = { byName: "A", idMasked: "x-1" };
  expect(renderTemplate("owner.promptpay_changed", payload)).toEqual(render(payload));
  expect(TEMPLATES["owner.promptpay_changed"].channels).toEqual(["web_push", "email"]);
  expect(TEMPLATES["owner.promptpay_changed"].vars).toEqual(["byName", "idMasked"]);
});
