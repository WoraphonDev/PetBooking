// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { pgEnum } from "drizzle-orm/pg-core";

export const orgStatusEnum = pgEnum("org_status", ["pilot", "active", "suspended"]);
export const adminStatusEnum = pgEnum("admin_status", ["active", "disabled"]);
export const staffRoleEnum = pgEnum("staff_role", ["owner", "front_desk", "staff"]);
export const staffStatusEnum = pgEnum("staff_status", ["invited", "active", "disabled"]);
export const sessionSubjectEnum = pgEnum("session_subject", ["staff", "customer", "platform_admin"]);
export const actorTypeEnum = pgEnum("actor_type", ["staff", "customer", "system", "platform_admin"]);
export const speciesEnum = pgEnum("species", ["dog", "cat", "other"]);
export const petSexEnum = pgEnum("pet_sex", ["male", "female", "unknown"]);
export const petStatusEnum = pgEnum("pet_status", ["active", "deceased", "rehomed"]);
/** ประเภทขนในโปรไฟล์ → แปลงเป็น coat_group ตาม R-02 */
export const coatTypeEnum = pgEnum("coat_type", ["short", "long", "double", "curly", "wire", "hairless", "unknown"]);
export const coatGroupEnum = pgEnum("coat_group", ["short", "long", "any"]);
export const temperamentFlagEnum = pgEnum("temperament_flag", [
  "bites",
  "needs_muzzle",
  "dryer_fear",
  "noise_sensitive",
  "same_groomer_only",
  "dog_reactive",
  "cat_reactive",
  "anxious",
  "other",
]);
export const vaccineStatusEnum = pgEnum("vaccine_status", ["pending_review", "verified", "rejected"]);
export const recordSourceEnum = pgEnum("record_source", ["shop", "customer", "import"]);
export const photoConsentEnum = pgEnum("photo_consent", ["unknown", "granted", "denied"]);
export const linkRequestStatusEnum = pgEnum("link_request_status", ["pending", "approved", "rejected"]);
export const fileKindEnum = pgEnum("file_kind", [
  "pet_profile",
  "before",
  "after",
  "stay_update",
  "vaccine_proof",
  "slip",
  "signature",
  "consent_pdf",
  "logo",
  "room_photo",
  "service_photo",
  "feedback",
  "import_csv",
  "proof",
]);
export const photoKindEnum = pgEnum("photo_kind", ["profile", "before", "after", "stay"]);
export const recordStatusEnum = pgEnum("record_status", ["active", "archived"]);
export const closureScopeEnum = pgEnum("closure_scope", ["all", "grooming", "hotel", "daycare"]);
export const closureSourceEnum = pgEnum("closure_source", ["manual", "public_holiday"]);
export const depositTypeEnum = pgEnum("deposit_type", ["none", "fixed", "percent"]);
export const cancelRefundModeEnum = pgEnum("cancel_refund_mode", ["refund", "credit", "customer_choice"]);
export const promptpayTypeEnum = pgEnum("promptpay_type", ["phone", "national_id", "tax_id", "ewallet"]);
export const lineChannelStatusEnum = pgEnum("line_channel_status", ["pending", "active", "error"]);
export const serviceScopeEnum = pgEnum("service_scope", ["grooming", "hotel", "daycare"]);
export const serviceCategoryEnum = pgEnum("service_category", [
  "bath",
  "haircut",
  "spa",
  "nail",
  "ear",
  "teeth",
  "deshed",
  "other",
  "hotel_addon",
  "daycare_addon",
]);
export const rateChannelEnum = pgEnum("rate_channel", ["all", "walk_in", "line", "ota"]);
export const roomUnitStatusEnum = pgEnum("room_unit_status", ["active", "maintenance", "archived"]);
export const housekeepingStatusEnum = pgEnum("housekeeping_status", ["clean", "dirty"]);
export const daycareSessionEnum = pgEnum("daycare_session", ["full_day", "morning", "afternoon"]);
export const packageShareScopeEnum = pgEnum("package_share_scope", ["single_pet", "household"]);
export const commissionTypeEnum = pgEnum("commission_type", ["percent", "fixed"]);
export const bookingChannelEnum = pgEnum("booking_channel", ["walk_in", "phone", "chat", "line_liff", "booking_link", "ota", "import"]);
/** สถานะใบจอง (ดู state machine ใน 03) */
export const bookingStatusEnum = pgEnum("booking_status", [
  "awaiting_deposit",
  "deposit_review",
  "awaiting_approval",
  "confirmed",
  "cancelled",
  "expired",
  "closed",
]);
/** สถานะมัดจำ (ดู 03) */
export const depositStatusEnum = pgEnum("deposit_status", [
  "not_required",
  "pending",
  "submitted",
  "verified",
  "rejected",
  "refunded",
  "credited",
  "forfeited",
  "applied",
]);
export const groomerPreferenceEnum = pgEnum("groomer_preference", ["any", "specific"]);
/** สถานะนัดกรูมรายตัว (ดู 03) */
export const groomStatusEnum = pgEnum("groom_status", [
  "scheduled",
  "checked_in",
  "in_progress",
  "done",
  "picked_up",
  "no_show",
  "cancelled",
]);
export const stayStatusEnum = pgEnum("stay_status", ["reserved", "checked_in", "checked_out", "no_show", "cancelled"]);
export const daycareStatusEnum = pgEnum("daycare_status", ["reserved", "checked_in", "checked_out", "no_show", "cancelled"]);
export const consentDocKindEnum = pgEnum("consent_doc_kind", ["grooming_consent", "boarding_agreement"]);
export const careTaskTypeEnum = pgEnum("care_task_type", ["feed", "medication", "walk", "clean", "other"]);
export const careTaskStatusEnum = pgEnum("care_task_status", ["pending", "done", "skipped"]);
export const slipStatusEnum = pgEnum("slip_status", ["submitted", "verified", "rejected"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "promptpay", "bank_transfer", "card_edc", "deposit", "credit"]);
export const paymentStatusEnum = pgEnum("payment_status", ["posted", "voided"]);
export const refundModeEnum = pgEnum("refund_mode", ["bank_transfer", "cash", "credit"]);
export const creditReasonEnum = pgEnum("credit_reason", [
  "cancellation_credit",
  "deposit_credit",
  "bill_payment",
  "void_reversal",
  "adjustment",
]);
export const billStatusEnum = pgEnum("bill_status", ["open", "paid", "void"]);
export const billLineTypeEnum = pgEnum("bill_line_type", [
  "groom_service",
  "groom_addon",
  "surcharge",
  "stay_night",
  "stay_addon",
  "daycare",
  "quick_item",
  "package_sale",
  "package_redemption",
]);
export const customerPackageStatusEnum = pgEnum("customer_package_status", ["active", "exhausted", "expired", "void"]);
export const commissionStatusEnum = pgEnum("commission_status", ["earned", "reversed"]);
export const reportCardKindEnum = pgEnum("report_card_kind", ["grooming", "stay"]);
export const reportCardStatusEnum = pgEnum("report_card_status", ["draft", "pending_review", "sent"]);
export const skinConditionEnum = pgEnum("skin_condition", ["normal", "dry", "redness", "lesion"]);
export const earConditionEnum = pgEnum("ear_condition", ["clean", "dirty", "suspected_infection"]);
export const nailConditionEnum = pgEnum("nail_condition", ["trimmed", "ok", "overgrown"]);
export const teethConditionEnum = pgEnum("teeth_condition", ["ok", "tartar", "bad_breath"]);
export const parasiteFindingEnum = pgEnum("parasite_finding", ["none", "fleas", "ticks", "both"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["line_reply", "line_push", "web_push", "email"]);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "failed", "skipped"]);
export const notificationSkipReasonEnum = pgEnum("notification_skip_reason", [
  "quota_exhausted",
  "economy_mode",
  "pet_inactive",
  "no_recipient",
  "opted_out",
  "duplicate",
]);
export const recipientTypeEnum = pgEnum("recipient_type", ["customer", "staff", "platform_admin"]);
export const jobTypeEnum = pgEnum("job_type", [
  "expire_hold",
  "reminder_24h",
  "next_groom_reminder",
  "owner_daily_summary",
  "approval_overdue",
  "care_task_overdue_scan",
  "recompute_reliability",
  "package_expiry",
  "cleanup_uncommitted_files",
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed", "cancelled"]);
export const legalDocEnum = pgEnum("legal_doc", ["privacy_notice", "terms_of_service", "dpa", "photo_consent"]);
export const consentSubjectEnum = pgEnum("consent_subject", ["owner_profile", "organization"]);
export const dataRequestTypeEnum = pgEnum("data_request_type", ["access", "delete"]);
export const dataRequestStatusEnum = pgEnum("data_request_status", ["open", "done", "rejected"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["new", "acknowledged", "done"]);
export const importKindEnum = pgEnum("import_kind", ["customers_pets", "services"]);
export const importStatusEnum = pgEnum("import_status", ["validating", "ready", "importing", "done", "failed"]);
