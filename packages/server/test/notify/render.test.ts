import { expect, it, vi } from "vitest";
import { createEmailSender } from "../../src/integrations/email/index.ts";
import { renderTemplate } from "../../src/notify/templates/index.ts";

it("gives every email template its Q-0060 subject next to the 07 text", () => {
  expect(renderTemplate("staff.invite", { shopName: "ร้านน้องหมา", inviteUrl: "https://x.test/i" }).subject).toBe("คำเชิญเข้าร่วมร้าน ร้านน้องหมา");
  expect(renderTemplate("staff.password_reset", { resetUrl: "https://x.test/r" }).subject).toBe("ตั้งรหัสผ่านใหม่");
  expect(
    renderTemplate("owner.daily_summary", {
      date: "5 ต.ค. 2569",
      groomCount: 1,
      staysInHouse: 0,
      salesTotal: "฿0",
      noShows: 0,
      tomorrowCount: 0,
    }).subject,
  ).toBe("สรุปประจำวัน 5 ต.ค. 2569");
  expect(renderTemplate("owner.promptpay_changed", { idMasked: "xxx-1234", byName: "มิก" }).subject).toBe("⚠️ บัญชีรับเงินของร้านถูกเปลี่ยน");
  expect(renderTemplate("owner.support_access", { reason: "ตรวจบั๊ก" }).subject).toBe("ทีมงานเข้าดูข้อมูลร้านของคุณ");
  expect(renderTemplate("admin.feedback", { shopName: "ร้าน A", message: "ช่วยด้วย" }).subject).toBe("[Feedback] ร้าน A");
  expect(renderTemplate("admin.data_request", { type: "delete" }).subject).toBe("[PDPA] คำขอใหม่");
});

it("leaves LINE/push-only templates without a subject", () => {
  expect(renderTemplate("staff.care_task_overdue", { title: "ให้อาหาร", petName: "มะลิ", roomCode: "A1" })).not.toHaveProperty("subject");
});

it("sends the template subject, or the first line of the text when there is none", async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  const sender = createEmailSender({ from: "PJ-8 <no-reply@x.test>", transport: { sendMail } });
  await sender.send({ to: "a@x.test", subject: "ตั้งรหัสผ่านใหม่", text: "ลิงก์ https://x.test/r" });
  await sender.send({ to: "a@x.test", text: "บรรทัดแรก\nบรรทัดสอง" });
  expect(sendMail.mock.calls.map((c) => c[0].subject)).toEqual(["ตั้งรหัสผ่านใหม่", "บรรทัดแรก"]);
});
