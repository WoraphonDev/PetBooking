// Template registry: key → render(payload) → { text, subject?, url? } (Q-0060: subject for email, url for Web Push).
import type { NotificationPayloads, TemplateKey } from "../keys.ts";
import { render as t37 } from "./admin.data_request.ts";
import { render as t36 } from "./admin.feedback.ts";
import { render as t15 } from "./customer.balance_link.ts";
import { render as t3 } from "./customer.booking_cancelled.ts";
import { render as t1 } from "./customer.booking_confirmed.ts";
import { render as t2 } from "./customer.booking_declined.ts";
import { render as t0 } from "./customer.booking_received.ts";
import { render as t4 } from "./customer.booking_rescheduled.ts";
import { render as t5 } from "./customer.deposit_confirmed.ts";
import { render as t7 } from "./customer.hold_expired.ts";
import { render as t17 } from "./customer.link_approved.ts";
import { render as t18 } from "./customer.next_groom_reminder.ts";
import { render as t9 } from "./customer.no_show.ts";
import { render as t10 } from "./customer.ready_for_pickup.ts";
import { render as t14 } from "./customer.receipt.ts";
import { render as t8 } from "./customer.reminder_24h.ts";
import { render as t11 } from "./customer.report_card.ts";
import { render as t6 } from "./customer.slip_rejected.ts";
import { render as t12 } from "./customer.stay_checked_in.ts";
import { render as t13 } from "./customer.stay_update.ts";
import { render as t16 } from "./customer.vaccine_rejected.ts";
import { render as t32 } from "./owner.daily_summary.ts";
import { render as tLineError } from "./owner.line_error.ts";
import { render as t34 } from "./owner.promptpay_changed.ts";
import { render as t33 } from "./owner.quota_warning.ts";
import { render as t35 } from "./owner.support_access.ts";
import { render as t21 } from "./staff.approval_overdue.ts";
import { render as t22 } from "./staff.booking_cancelled.ts";
import { render as t23 } from "./staff.booking_rescheduled.ts";
import { render as t28 } from "./staff.care_task_overdue.ts";
import { render as t24 } from "./staff.groom_done.ts";
import { render as t30 } from "./staff.invite.ts";
import { render as t26 } from "./staff.link_request.ts";
import { render as t29 } from "./staff.low_rating.ts";
import { render as t19 } from "./staff.new_booking.ts";
import { render as t31 } from "./staff.password_reset.ts";
import { render as t25 } from "./staff.report_card_review.ts";
import { render as t20 } from "./staff.slip_submitted.ts";
import { render as t27 } from "./staff.vaccine_review.ts";

/** text = message body on every channel; subject = email subject; url = link a Web Push opens */
export type Rendered = { text: string; subject?: string; url?: string };

const RENDERERS: { [K in TemplateKey]: (payload: NotificationPayloads[K]) => Rendered } = {
  "customer.booking_received": t0,
  "customer.booking_confirmed": t1,
  "customer.booking_declined": t2,
  "customer.booking_cancelled": t3,
  "customer.booking_rescheduled": t4,
  "customer.deposit_confirmed": t5,
  "customer.slip_rejected": t6,
  "customer.hold_expired": t7,
  "customer.reminder_24h": t8,
  "customer.no_show": t9,
  "customer.ready_for_pickup": t10,
  "customer.report_card": t11,
  "customer.stay_checked_in": t12,
  "customer.stay_update": t13,
  "customer.receipt": t14,
  "customer.balance_link": t15,
  "customer.vaccine_rejected": t16,
  "customer.link_approved": t17,
  "customer.next_groom_reminder": t18,
  "staff.new_booking": t19,
  "staff.slip_submitted": t20,
  "staff.approval_overdue": t21,
  "staff.booking_cancelled": t22,
  "staff.booking_rescheduled": t23,
  "staff.groom_done": t24,
  "staff.report_card_review": t25,
  "staff.link_request": t26,
  "staff.vaccine_review": t27,
  "staff.care_task_overdue": t28,
  "staff.low_rating": t29,
  "staff.invite": t30,
  "staff.password_reset": t31,
  "owner.daily_summary": t32,
  "owner.line_error": tLineError,
  "owner.quota_warning": t33,
  "owner.promptpay_changed": t34,
  "owner.support_access": t35,
  "admin.feedback": t36,
  "admin.data_request": t37,
};

export function renderTemplate<K extends TemplateKey>(key: K, payload: NotificationPayloads[K]): Rendered {
  return RENDERERS[key](payload);
}
