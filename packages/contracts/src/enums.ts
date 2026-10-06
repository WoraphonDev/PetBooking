// Enums from docs/spec/02-data-model.md §12 (same order). test/enums.test.ts checks them against @app/db pgEnums.

import { z } from "zod";

export const orgStatusValues = ["pilot", "active", "suspended"] as const;
export const orgStatus = z.enum(orgStatusValues);
export type OrgStatus = z.infer<typeof orgStatus>;

export const adminStatusValues = ["active", "disabled"] as const;
export const adminStatus = z.enum(adminStatusValues);
export type AdminStatus = z.infer<typeof adminStatus>;

export const staffRoleValues = ["owner", "front_desk", "staff"] as const;
export const staffRole = z.enum(staffRoleValues);
export type StaffRole = z.infer<typeof staffRole>;

export const staffStatusValues = ["invited", "active", "disabled"] as const;
export const staffStatus = z.enum(staffStatusValues);
export type StaffStatus = z.infer<typeof staffStatus>;

export const sessionSubjectValues = ["staff", "customer", "platform_admin"] as const;
export const sessionSubject = z.enum(sessionSubjectValues);
export type SessionSubject = z.infer<typeof sessionSubject>;

export const actorTypeValues = ["staff", "customer", "system", "platform_admin"] as const;
export const actorType = z.enum(actorTypeValues);
export type ActorType = z.infer<typeof actorType>;

export const speciesValues = ["dog", "cat", "other"] as const;
export const species = z.enum(speciesValues);
export type Species = z.infer<typeof species>;

export const petSexValues = ["male", "female", "unknown"] as const;
export const petSex = z.enum(petSexValues);
export type PetSex = z.infer<typeof petSex>;

export const petStatusValues = ["active", "deceased", "rehomed"] as const;
export const petStatus = z.enum(petStatusValues);
export type PetStatus = z.infer<typeof petStatus>;

/** ประเภทขนในโปรไฟล์ → แปลงเป็น coat_group ตาม R-02 */
export const coatTypeValues = ["short", "long", "double", "curly", "wire", "hairless", "unknown"] as const;
export const coatType = z.enum(coatTypeValues);
export type CoatType = z.infer<typeof coatType>;

export const coatGroupValues = ["short", "long", "any"] as const;
export const coatGroup = z.enum(coatGroupValues);
export type CoatGroup = z.infer<typeof coatGroup>;

export const temperamentFlagValues = [
  "bites",
  "needs_muzzle",
  "dryer_fear",
  "noise_sensitive",
  "same_groomer_only",
  "dog_reactive",
  "cat_reactive",
  "anxious",
  "other",
] as const;
export const temperamentFlag = z.enum(temperamentFlagValues);
export type TemperamentFlag = z.infer<typeof temperamentFlag>;

export const vaccineStatusValues = ["pending_review", "verified", "rejected"] as const;
export const vaccineStatus = z.enum(vaccineStatusValues);
export type VaccineStatus = z.infer<typeof vaccineStatus>;

export const recordSourceValues = ["shop", "customer", "import"] as const;
export const recordSource = z.enum(recordSourceValues);
export type RecordSource = z.infer<typeof recordSource>;

export const photoConsentValues = ["unknown", "granted", "denied"] as const;
export const photoConsent = z.enum(photoConsentValues);
export type PhotoConsent = z.infer<typeof photoConsent>;

export const linkRequestStatusValues = ["pending", "approved", "rejected"] as const;
export const linkRequestStatus = z.enum(linkRequestStatusValues);
export type LinkRequestStatus = z.infer<typeof linkRequestStatus>;

export const fileKindValues = [
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
  "staff_photo",
] as const;
export const fileKind = z.enum(fileKindValues);
export type FileKind = z.infer<typeof fileKind>;

export const photoKindValues = ["profile", "before", "after", "stay"] as const;
export const photoKind = z.enum(photoKindValues);
export type PhotoKind = z.infer<typeof photoKind>;

export const recordStatusValues = ["active", "archived"] as const;
export const recordStatus = z.enum(recordStatusValues);
export type RecordStatus = z.infer<typeof recordStatus>;

export const closureScopeValues = ["all", "grooming", "hotel", "daycare"] as const;
export const closureScope = z.enum(closureScopeValues);
export type ClosureScope = z.infer<typeof closureScope>;

export const closureSourceValues = ["manual", "public_holiday"] as const;
export const closureSource = z.enum(closureSourceValues);
export type ClosureSource = z.infer<typeof closureSource>;

export const depositTypeValues = ["none", "fixed", "percent"] as const;
export const depositType = z.enum(depositTypeValues);
export type DepositType = z.infer<typeof depositType>;

export const cancelRefundModeValues = ["refund", "credit", "customer_choice"] as const;
export const cancelRefundMode = z.enum(cancelRefundModeValues);
export type CancelRefundMode = z.infer<typeof cancelRefundMode>;

export const promptpayTypeValues = ["phone", "national_id", "tax_id", "ewallet"] as const;
export const promptpayType = z.enum(promptpayTypeValues);
export type PromptpayType = z.infer<typeof promptpayType>;

export const lineChannelStatusValues = ["pending", "active", "error"] as const;
export const lineChannelStatus = z.enum(lineChannelStatusValues);
export type LineChannelStatus = z.infer<typeof lineChannelStatus>;

export const serviceScopeValues = ["grooming", "hotel", "daycare"] as const;
export const serviceScope = z.enum(serviceScopeValues);
export type ServiceScope = z.infer<typeof serviceScope>;

export const serviceCategoryValues = [
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
] as const;
export const serviceCategory = z.enum(serviceCategoryValues);
export type ServiceCategory = z.infer<typeof serviceCategory>;

export const rateChannelValues = ["all", "walk_in", "line", "ota"] as const;
export const rateChannel = z.enum(rateChannelValues);
export type RateChannel = z.infer<typeof rateChannel>;

export const roomUnitStatusValues = ["active", "maintenance", "archived"] as const;
export const roomUnitStatus = z.enum(roomUnitStatusValues);
export type RoomUnitStatus = z.infer<typeof roomUnitStatus>;

export const housekeepingStatusValues = ["clean", "dirty"] as const;
export const housekeepingStatus = z.enum(housekeepingStatusValues);
export type HousekeepingStatus = z.infer<typeof housekeepingStatus>;

export const daycareSessionValues = ["full_day", "morning", "afternoon"] as const;
export const daycareSession = z.enum(daycareSessionValues);
export type DaycareSession = z.infer<typeof daycareSession>;

export const packageShareScopeValues = ["single_pet", "household"] as const;
export const packageShareScope = z.enum(packageShareScopeValues);
export type PackageShareScope = z.infer<typeof packageShareScope>;

export const commissionTypeValues = ["percent", "fixed"] as const;
export const commissionType = z.enum(commissionTypeValues);
export type CommissionType = z.infer<typeof commissionType>;

export const bookingChannelValues = ["walk_in", "phone", "chat", "line_liff", "booking_link", "ota", "import"] as const;
export const bookingChannel = z.enum(bookingChannelValues);
export type BookingChannel = z.infer<typeof bookingChannel>;

/** สถานะใบจอง (ดู state machine ใน 03) */
export const bookingStatusValues = [
  "awaiting_deposit",
  "deposit_review",
  "awaiting_approval",
  "confirmed",
  "cancelled",
  "expired",
  "closed",
] as const;
export const bookingStatus = z.enum(bookingStatusValues);
export type BookingStatus = z.infer<typeof bookingStatus>;

/** สถานะมัดจำ (ดู 03) */
export const depositStatusValues = [
  "not_required",
  "pending",
  "submitted",
  "verified",
  "rejected",
  "refunded",
  "credited",
  "forfeited",
  "applied",
] as const;
export const depositStatus = z.enum(depositStatusValues);
export type DepositStatus = z.infer<typeof depositStatus>;

export const groomerPreferenceValues = ["any", "specific"] as const;
export const groomerPreference = z.enum(groomerPreferenceValues);
export type GroomerPreference = z.infer<typeof groomerPreference>;

/** สถานะนัดกรูมรายตัว (ดู 03) */
export const groomStatusValues = ["scheduled", "checked_in", "in_progress", "done", "picked_up", "no_show", "cancelled"] as const;
export const groomStatus = z.enum(groomStatusValues);
export type GroomStatus = z.infer<typeof groomStatus>;

export const stayStatusValues = ["reserved", "checked_in", "checked_out", "no_show", "cancelled"] as const;
export const stayStatus = z.enum(stayStatusValues);
export type StayStatus = z.infer<typeof stayStatus>;

export const daycareStatusValues = ["reserved", "checked_in", "checked_out", "no_show", "cancelled"] as const;
export const daycareStatus = z.enum(daycareStatusValues);
export type DaycareStatus = z.infer<typeof daycareStatus>;

export const consentDocKindValues = ["grooming_consent", "boarding_agreement"] as const;
export const consentDocKind = z.enum(consentDocKindValues);
export type ConsentDocKind = z.infer<typeof consentDocKind>;

export const careTaskTypeValues = ["feed", "medication", "walk", "clean", "other"] as const;
export const careTaskType = z.enum(careTaskTypeValues);
export type CareTaskType = z.infer<typeof careTaskType>;

export const careTaskStatusValues = ["pending", "done", "skipped"] as const;
export const careTaskStatus = z.enum(careTaskStatusValues);
export type CareTaskStatus = z.infer<typeof careTaskStatus>;

export const slipStatusValues = ["submitted", "verified", "rejected"] as const;
export const slipStatus = z.enum(slipStatusValues);
export type SlipStatus = z.infer<typeof slipStatus>;

export const paymentMethodValues = ["cash", "promptpay", "bank_transfer", "card_edc", "deposit", "credit"] as const;
export const paymentMethod = z.enum(paymentMethodValues);
export type PaymentMethod = z.infer<typeof paymentMethod>;

export const paymentStatusValues = ["posted", "voided"] as const;
export const paymentStatus = z.enum(paymentStatusValues);
export type PaymentStatus = z.infer<typeof paymentStatus>;

export const refundModeValues = ["bank_transfer", "cash", "credit"] as const;
export const refundMode = z.enum(refundModeValues);
export type RefundMode = z.infer<typeof refundMode>;

export const creditReasonValues = ["cancellation_credit", "deposit_credit", "bill_payment", "void_reversal", "adjustment"] as const;
export const creditReason = z.enum(creditReasonValues);
export type CreditReason = z.infer<typeof creditReason>;

export const billStatusValues = ["open", "paid", "void"] as const;
export const billStatus = z.enum(billStatusValues);
export type BillStatus = z.infer<typeof billStatus>;

export const billLineTypeValues = [
  "groom_service",
  "groom_addon",
  "surcharge",
  "stay_night",
  "stay_addon",
  "daycare",
  "quick_item",
  "package_sale",
  "package_redemption",
] as const;
export const billLineType = z.enum(billLineTypeValues);
export type BillLineType = z.infer<typeof billLineType>;

export const customerPackageStatusValues = ["active", "exhausted", "expired", "void"] as const;
export const customerPackageStatus = z.enum(customerPackageStatusValues);
export type CustomerPackageStatus = z.infer<typeof customerPackageStatus>;

export const commissionStatusValues = ["earned", "reversed"] as const;
export const commissionStatus = z.enum(commissionStatusValues);
export type CommissionStatus = z.infer<typeof commissionStatus>;

export const reportCardKindValues = ["grooming", "stay"] as const;
export const reportCardKind = z.enum(reportCardKindValues);
export type ReportCardKind = z.infer<typeof reportCardKind>;

export const reportCardStatusValues = ["draft", "pending_review", "sent"] as const;
export const reportCardStatus = z.enum(reportCardStatusValues);
export type ReportCardStatus = z.infer<typeof reportCardStatus>;

export const skinConditionValues = ["normal", "dry", "redness", "lesion"] as const;
export const skinCondition = z.enum(skinConditionValues);
export type SkinCondition = z.infer<typeof skinCondition>;

export const earConditionValues = ["clean", "dirty", "suspected_infection"] as const;
export const earCondition = z.enum(earConditionValues);
export type EarCondition = z.infer<typeof earCondition>;

export const nailConditionValues = ["trimmed", "ok", "overgrown"] as const;
export const nailCondition = z.enum(nailConditionValues);
export type NailCondition = z.infer<typeof nailCondition>;

export const teethConditionValues = ["ok", "tartar", "bad_breath"] as const;
export const teethCondition = z.enum(teethConditionValues);
export type TeethCondition = z.infer<typeof teethCondition>;

export const parasiteFindingValues = ["none", "fleas", "ticks", "both"] as const;
export const parasiteFinding = z.enum(parasiteFindingValues);
export type ParasiteFinding = z.infer<typeof parasiteFinding>;

export const notificationChannelValues = ["line_reply", "line_push", "web_push", "email"] as const;
export const notificationChannel = z.enum(notificationChannelValues);
export type NotificationChannel = z.infer<typeof notificationChannel>;

export const notificationStatusValues = ["queued", "sent", "failed", "skipped"] as const;
export const notificationStatus = z.enum(notificationStatusValues);
export type NotificationStatus = z.infer<typeof notificationStatus>;

export const notificationSkipReasonValues = [
  "quota_exhausted",
  "economy_mode",
  "pet_inactive",
  "no_recipient",
  "opted_out",
  "duplicate",
] as const;
export const notificationSkipReason = z.enum(notificationSkipReasonValues);
export type NotificationSkipReason = z.infer<typeof notificationSkipReason>;

export const recipientTypeValues = ["customer", "staff", "platform_admin"] as const;
export const recipientType = z.enum(recipientTypeValues);
export type RecipientType = z.infer<typeof recipientType>;

export const jobTypeValues = [
  "expire_hold",
  "reminder_24h",
  "next_groom_reminder",
  "owner_daily_summary",
  "approval_overdue",
  "care_task_overdue_scan",
  "recompute_reliability",
  "package_expiry",
  "cleanup_uncommitted_files",
] as const;
export const jobType = z.enum(jobTypeValues);
export type JobType = z.infer<typeof jobType>;

export const jobStatusValues = ["pending", "running", "done", "failed", "cancelled"] as const;
export const jobStatus = z.enum(jobStatusValues);
export type JobStatus = z.infer<typeof jobStatus>;

export const legalDocValues = ["privacy_notice", "terms_of_service", "dpa", "photo_consent"] as const;
export const legalDoc = z.enum(legalDocValues);
export type LegalDoc = z.infer<typeof legalDoc>;

export const consentSubjectValues = ["owner_profile", "organization"] as const;
export const consentSubject = z.enum(consentSubjectValues);
export type ConsentSubject = z.infer<typeof consentSubject>;

export const dataRequestTypeValues = ["access", "delete"] as const;
export const dataRequestType = z.enum(dataRequestTypeValues);
export type DataRequestType = z.infer<typeof dataRequestType>;

export const dataRequestStatusValues = ["open", "done", "rejected"] as const;
export const dataRequestStatus = z.enum(dataRequestStatusValues);
export type DataRequestStatus = z.infer<typeof dataRequestStatus>;

export const feedbackStatusValues = ["new", "acknowledged", "done"] as const;
export const feedbackStatus = z.enum(feedbackStatusValues);
export type FeedbackStatus = z.infer<typeof feedbackStatus>;

export const importKindValues = ["customers_pets", "services"] as const;
export const importKind = z.enum(importKindValues);
export type ImportKind = z.infer<typeof importKind>;

export const importStatusValues = ["validating", "ready", "importing", "done", "failed"] as const;
export const importStatus = z.enum(importStatusValues);
export type ImportStatus = z.infer<typeof importStatus>;
