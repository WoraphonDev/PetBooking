// Notification template catalog (07 §1) — one entry per template key. test/notify/catalog.test.ts keeps it equal to the 07 table.
// channels: allowed delivery channels (R-19 must pick one of these); messageClass/economy: R-18 inputs for customer LINE messages.

type Channel = "line_reply" | "line_push" | "web_push" | "email";
type TemplateMeta = {
  recipients: string;
  channels: readonly Channel[];
  messageClass: "essential" | "helpful" | "marketing" | null;
  economy: "send" | "skip" | null;
  vars: readonly string[];
};

export const TEMPLATES = {
  "customer.booking_received": {
    recipients: "customer",
    channels: ["line_reply", "line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["shopName", "bookingNo", "summary", "depositAmount", "holdExpiresTime", "bookingUrl"],
  },
  "customer.booking_confirmed": {
    recipients: "customer",
    channels: ["line_reply", "line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["bookingNo", "summary", "dateTime", "shopName", "bookingUrl"],
  },
  "customer.booking_declined": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["bookingNo", "reason", "refundLine"],
  },
  "customer.booking_cancelled": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["bookingNo", "reason", "moneyLine"],
  },
  "customer.booking_rescheduled": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["petName", "oldDateTime", "newDateTime"],
  },
  "customer.deposit_confirmed": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["bookingNo", "amount"],
  },
  "customer.slip_rejected": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["bookingNo", "reason", "newDeadline", "payUrl"],
  },
  "customer.hold_expired": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "send",
    vars: ["bookingNo", "bookAgainUrl"],
  },
  "customer.reminder_24h": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "skip",
    vars: ["petName", "dateTime", "service", "bookingUrl"],
  },
  "customer.no_show": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "skip",
    vars: ["petName", "moneyLine", "bookAgainUrl"],
  },
  "customer.ready_for_pickup": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "send",
    vars: ["petName", "reportCardUrl", "balance"],
  },
  "customer.report_card": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "send",
    vars: ["petName", "reportCardUrl"],
  },
  "customer.stay_checked_in": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "skip",
    vars: ["petName", "roomCode", "updatesUrl"],
  },
  "customer.stay_update": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "skip",
    vars: ["petName", "updatesUrl"],
  },
  "customer.receipt": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "skip",
    vars: ["receiptNo", "total", "receiptUrl"],
  },
  "customer.balance_link": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "essential",
    economy: "send",
    vars: ["amount", "payUrl"],
  },
  "customer.vaccine_rejected": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "send",
    vars: ["petName", "vaccineName", "reason", "petUrl"],
  },
  "customer.link_approved": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "helpful",
    economy: "send",
    vars: ["shopName"],
  },
  "customer.next_groom_reminder": {
    recipients: "customer",
    channels: ["line_push"],
    messageClass: "marketing",
    economy: "skip",
    vars: ["petName", "dueDate", "bookUrl"],
  },
  "staff.new_booking": {
    recipients: "front_desk+owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["bookingNo", "customerName", "summary"],
  },
  "staff.slip_submitted": {
    recipients: "front_desk+owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["bookingNo", "amount", "duplicateFlag"],
  },
  "staff.approval_overdue": {
    recipients: "front_desk+owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["bookingNo", "waitedMinutes"],
  },
  "staff.booking_cancelled": {
    recipients: "front_desk+owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["bookingNo", "customerName", "isLate"],
  },
  "staff.booking_rescheduled": {
    recipients: "front_desk+owner+groomer",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["petName", "newDateTime"],
  },
  "staff.groom_done": {
    recipients: "front_desk",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["petName", "groomerName"],
  },
  "staff.report_card_review": { recipients: "front_desk", channels: ["web_push"], messageClass: null, economy: null, vars: ["petName"] },
  "staff.link_request": {
    recipients: "front_desk+owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["lineName", "phone"],
  },
  "staff.vaccine_review": { recipients: "front_desk", channels: ["web_push"], messageClass: null, economy: null, vars: ["petName"] },
  "staff.care_task_overdue": {
    recipients: "staff (ทุกคนที่ active ในสาขา)",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["title", "petName", "roomCode"],
  },
  "staff.low_rating": {
    recipients: "owner",
    channels: ["web_push"],
    messageClass: null,
    economy: null,
    vars: ["petName", "rating", "feedback"],
  },
  "staff.invite": { recipients: "ผู้ถูกเชิญ", channels: ["email"], messageClass: null, economy: null, vars: ["shopName", "inviteUrl"] },
  "staff.password_reset": { recipients: "พนักงาน", channels: ["email"], messageClass: null, economy: null, vars: ["resetUrl"] },
  "owner.daily_summary": {
    recipients: "owner",
    channels: ["web_push", "email"],
    messageClass: null,
    economy: null,
    vars: ["date", "groomCount", "staysInHouse", "salesTotal", "noShows", "tomorrowCount"],
  },
  "owner.line_error": {
    recipients: "owner",
    channels: ["web_push", "email"],
    messageClass: null,
    economy: null,
    vars: ["branchName"],
  },
  "owner.quota_warning": { recipients: "owner", channels: ["web_push"], messageClass: null, economy: null, vars: ["used", "quota"] },
  "owner.promptpay_changed": {
    recipients: "owner (ทุกคน)",
    channels: ["web_push", "email"],
    messageClass: null,
    economy: null,
    vars: ["byName", "idMasked"],
  },
  "owner.support_access": { recipients: "owner", channels: ["web_push", "email"], messageClass: null, economy: null, vars: ["reason"] },
  "admin.feedback": { recipients: "platform admin", channels: ["email"], messageClass: null, economy: null, vars: ["shopName", "message"] },
  "admin.data_request": { recipients: "platform admin", channels: ["email"], messageClass: null, economy: null, vars: ["type"] },
} as const satisfies Record<string, TemplateMeta>;

export type TemplateKey = keyof typeof TEMPLATES;

/** Template variables (07 'ตัวแปร') — values are pre-formatted by the caller (money/date formatting = R-31). */
export type NotificationPayloads = {
  [K in TemplateKey]: { [V in (typeof TEMPLATES)[K]["vars"][number]]: string | number };
};
