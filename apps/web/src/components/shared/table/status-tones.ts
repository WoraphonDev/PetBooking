// ADR-006 §3: StatusBadge tone per enum value. Values not listed fall back to neutral.
import type { EnumName } from "../../../lib/enum-label.ts";

export type StatusTone = "info" | "progress" | "success" | "attention" | "danger" | "neutral";

export const STATUS_TONES = {
  staff_status: { invited: "info", active: "success", disabled: "neutral" },
  pet_status: { active: "success", deceased: "neutral", rehomed: "neutral" },
  vaccine_status: { pending_review: "progress", verified: "success", rejected: "danger" },
  line_channel_status: { pending: "progress", active: "success", error: "danger" },
  room_unit_status: { maintenance: "progress", active: "success", archived: "neutral" },
  housekeeping_status: { dirty: "progress", clean: "success" },
  booking_status: {
    deposit_review: "progress",
    awaiting_approval: "progress",
    confirmed: "success",
    awaiting_deposit: "attention",
    cancelled: "neutral",
    expired: "neutral",
    closed: "neutral",
  },
  deposit_status: {
    submitted: "progress",
    verified: "success",
    pending: "attention",
    rejected: "danger",
    not_required: "neutral",
    refunded: "neutral",
    credited: "neutral",
    forfeited: "neutral",
    applied: "neutral",
  },
  groom_status: {
    scheduled: "info",
    checked_in: "info",
    in_progress: "progress",
    done: "success",
    no_show: "danger",
    picked_up: "neutral",
    cancelled: "neutral",
  },
  stay_status: { reserved: "info", checked_in: "progress", no_show: "danger", checked_out: "neutral", cancelled: "neutral" },
  daycare_status: { reserved: "info", checked_in: "progress", no_show: "danger", checked_out: "neutral", cancelled: "neutral" },
  care_task_status: { pending: "progress", done: "success", skipped: "neutral" },
  slip_status: { submitted: "progress", verified: "success", rejected: "danger" },
  bill_status: { open: "info", paid: "success", void: "neutral" },
  customer_package_status: { active: "success", exhausted: "neutral", expired: "neutral", void: "neutral" },
  report_card_status: { pending_review: "progress", sent: "success", draft: "neutral" },
  org_status: { pilot: "info", active: "success", suspended: "danger" },
} as const satisfies Partial<Record<EnumName, Record<string, StatusTone>>>;

export type StatusEnum = keyof typeof STATUS_TONES;

export function statusTone(enumName: StatusEnum, value: string): StatusTone {
  const tones: Record<string, StatusTone> = STATUS_TONES[enumName];
  return tones[value] ?? "neutral";
}

/** background / text pair per tone (ADR-006 §3) */
export const TONE_CLASS: Record<StatusTone, string> = {
  info: "bg-accent text-accent-foreground",
  progress: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  attention: "bg-price-soft text-price",
  danger: "bg-destructive-soft text-destructive",
  neutral: "bg-muted text-muted-foreground",
};
