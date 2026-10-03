import { notification } from "@app/db/schema";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEmailSender, createFakeEmailSender } from "../../src/integrations/email/index.ts";
import { dispatchQueued } from "../../src/notify/dispatch.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());

const from = "PJ-8 <no-reply@example.test>";

it("sends the rendered text from MAIL_FROM to the recipient", async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  await createEmailSender({ from, transport: { sendMail } }).send({ to: "a@x.test", text: "ข้อความ" });
  expect(sendMail).toHaveBeenCalledWith({ from, to: "a@x.test", subject: "ข้อความ", text: "ข้อความ" });
});

it("reads SMTP_URL and MAIL_FROM from the environment and refuses to send without them", async () => {
  vi.stubEnv("SMTP_URL", "");
  vi.stubEnv("MAIL_FROM", "");
  try {
    await expect(createEmailSender().send({ to: "a@x.test", text: "t" })).rejects.toThrow("Email SMTP configuration missing");
    await expect(createEmailSender({ smtpUrl: "smtp://localhost:2525" }).send({ to: "a@x.test", text: "t" })).rejects.toThrow(
      "Email SMTP configuration missing",
    );
    vi.stubEnv("MAIL_FROM", from);
    const sendMail = vi.fn().mockResolvedValue({});
    await createEmailSender({ transport: { sendMail } }).send({ to: "a@x.test", text: "t" });
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({ from });
  } finally {
    vi.unstubAllEnvs();
  }
});

it("redacts transport errors so credentials and reset links never reach notification.error", async () => {
  const sendMail = vi.fn().mockRejectedValue(new Error("auth failed for smtp://user:secret@host https://x.test/reset?token=abc"));
  await expect(createEmailSender({ from, transport: { sendMail } }).send({ to: "a@x.test", text: "t" })).rejects.toThrow(
    /^Email delivery failed$/,
  );
});

it("dispatches invite and password reset emails to the staff mailbox", async () => {
  const s = env.base;
  const fake = createFakeEmailSender();
  await env.db.insert(notification).values([
    {
      organizationId: s.orgId,
      branchId: s.branchId,
      recipientType: "staff" as const,
      recipientId: s.staff.staff,
      templateKey: "staff.invite",
      channel: "email" as const,
      payload: { shopName: "ร้านทดสอบ", inviteUrl: "https://app.test/invite/abc" },
      dedupeKey: "invite:email-test",
      monthKey: "2026-10",
    },
    {
      organizationId: s.orgId,
      branchId: s.branchId,
      recipientType: "staff" as const,
      recipientId: s.staff.owner,
      templateKey: "staff.password_reset",
      channel: "email" as const,
      payload: { resetUrl: "https://app.test/reset/xyz" },
      dedupeKey: "pwreset:email-test",
      monthKey: "2026-10",
    },
  ]);
  await dispatchQueued({ line: { send: async () => {} }, webPush: { send: async () => ({ ok: true }) }, email: fake }, { now: TEST_NOW });
  expect(fake.outbox).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        to: "staff@a.test",
        text: "คุณได้รับเชิญเข้าร่วมร้าน ร้านทดสอบ — https://app.test/invite/abc (หมดอายุใน 7 วัน)",
      }),
      expect.objectContaining({
        to: "owner@a.test",
        text: "ตั้งรหัสผ่านใหม่: https://app.test/reset/xyz (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้",
      }),
    ]),
  );
  const rows = await env.db.select().from(notification);
  expect(rows.map((r) => [r.status, r.channel])).toEqual([
    ["sent", "email"],
    ["sent", "email"],
  ]);
});
