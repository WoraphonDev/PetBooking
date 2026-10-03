import nodemailer from "nodemailer";
import type { EmailSender } from "../../notify/senders.ts";

export type EmailMessage = { from: string; to: string; subject: string; text: string };
type Transport = { sendMail(message: EmailMessage): Promise<unknown> };

// Q-0060: the template's subject; a template without one falls back to the first line of its text.
function message(from: string, input: Parameters<EmailSender["send"]>[0]): EmailMessage {
  return { from, to: input.to, subject: input.subject ?? input.text.split("\n")[0] ?? "", text: input.text };
}

/** SMTP sender (ADR-003): provider is chosen by `SMTP_URL` alone, sender address by `MAIL_FROM`. */
export function createEmailSender(options: { smtpUrl?: string; from?: string; transport?: Transport } = {}) {
  let transport = options.transport;
  return {
    async send(input) {
      const smtpUrl = options.smtpUrl ?? process.env.SMTP_URL ?? "";
      const from = options.from ?? process.env.MAIL_FROM ?? "";
      if ((!transport && !smtpUrl) || !from) throw new Error("Email SMTP configuration missing");
      transport ??= nodemailer.createTransport(smtpUrl);
      try {
        await transport.sendMail(message(from, input));
      } catch {
        // The dispatcher persists this error: SMTP errors can echo credentials from SMTP_URL or the invite/reset URL.
        throw new Error("Email delivery failed");
      }
    },
  } satisfies EmailSender;
}

/** In-memory sender for tests and local dev without SMTP: messages land in `outbox`, nothing is logged. */
export function createFakeEmailSender(options: { from?: string } = {}) {
  const outbox: EmailMessage[] = [];
  return {
    outbox,
    async send(input) {
      outbox.push(message(options.from ?? "fake@example.test", input));
    },
  } satisfies EmailSender & { outbox: EmailMessage[] };
}
