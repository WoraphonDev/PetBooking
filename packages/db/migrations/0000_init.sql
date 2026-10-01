CREATE TYPE "public"."actor_type" AS ENUM('staff', 'customer', 'system', 'platform_admin');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."bill_line_type" AS ENUM('groom_service', 'groom_addon', 'surcharge', 'stay_night', 'stay_addon', 'daycare', 'quick_item', 'package_sale', 'package_redemption');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('open', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."booking_channel" AS ENUM('walk_in', 'phone', 'chat', 'line_liff', 'booking_link', 'ota', 'import');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('awaiting_deposit', 'deposit_review', 'awaiting_approval', 'confirmed', 'cancelled', 'expired', 'closed');--> statement-breakpoint
CREATE TYPE "public"."cancel_refund_mode" AS ENUM('refund', 'credit', 'customer_choice');--> statement-breakpoint
CREATE TYPE "public"."care_task_status" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."care_task_type" AS ENUM('feed', 'medication', 'walk', 'clean', 'other');--> statement-breakpoint
CREATE TYPE "public"."closure_scope" AS ENUM('all', 'grooming', 'hotel', 'daycare');--> statement-breakpoint
CREATE TYPE "public"."closure_source" AS ENUM('manual', 'public_holiday');--> statement-breakpoint
CREATE TYPE "public"."coat_group" AS ENUM('short', 'long', 'any');--> statement-breakpoint
CREATE TYPE "public"."coat_type" AS ENUM('short', 'long', 'double', 'curly', 'wire', 'hairless', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('earned', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."consent_doc_kind" AS ENUM('grooming_consent', 'boarding_agreement');--> statement-breakpoint
CREATE TYPE "public"."consent_subject" AS ENUM('owner_profile', 'organization');--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('cancellation_credit', 'deposit_credit', 'bill_payment', 'void_reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."customer_package_status" AS ENUM('active', 'exhausted', 'expired', 'void');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('open', 'done', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."data_request_type" AS ENUM('access', 'delete');--> statement-breakpoint
CREATE TYPE "public"."daycare_session" AS ENUM('full_day', 'morning', 'afternoon');--> statement-breakpoint
CREATE TYPE "public"."daycare_status" AS ENUM('reserved', 'checked_in', 'checked_out', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('not_required', 'pending', 'submitted', 'verified', 'rejected', 'refunded', 'credited', 'forfeited', 'applied');--> statement-breakpoint
CREATE TYPE "public"."deposit_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."ear_condition" AS ENUM('clean', 'dirty', 'suspected_infection');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'acknowledged', 'done');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('pet_profile', 'before', 'after', 'stay_update', 'vaccine_proof', 'slip', 'signature', 'consent_pdf', 'logo', 'room_photo', 'service_photo', 'feedback', 'import_csv', 'proof');--> statement-breakpoint
CREATE TYPE "public"."groom_status" AS ENUM('scheduled', 'checked_in', 'in_progress', 'done', 'picked_up', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."groomer_preference" AS ENUM('any', 'specific');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_status" AS ENUM('clean', 'dirty');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('customers_pets', 'services');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('validating', 'ready', 'importing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('expire_hold', 'reminder_24h', 'next_groom_reminder', 'owner_daily_summary', 'approval_overdue', 'care_task_overdue_scan', 'recompute_reliability', 'package_expiry', 'cleanup_uncommitted_files');--> statement-breakpoint
CREATE TYPE "public"."legal_doc" AS ENUM('privacy_notice', 'terms_of_service', 'dpa', 'photo_consent');--> statement-breakpoint
CREATE TYPE "public"."line_channel_status" AS ENUM('pending', 'active', 'error');--> statement-breakpoint
CREATE TYPE "public"."link_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."nail_condition" AS ENUM('trimmed', 'ok', 'overgrown');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('line_reply', 'line_push', 'web_push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_skip_reason" AS ENUM('quota_exhausted', 'economy_mode', 'pet_inactive', 'no_recipient', 'opted_out', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('pilot', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."package_share_scope" AS ENUM('single_pet', 'household');--> statement-breakpoint
CREATE TYPE "public"."parasite_finding" AS ENUM('none', 'fleas', 'ticks', 'both');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'promptpay', 'bank_transfer', 'card_edc', 'deposit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('posted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."pet_status" AS ENUM('active', 'deceased', 'rehomed');--> statement-breakpoint
CREATE TYPE "public"."photo_consent" AS ENUM('unknown', 'granted', 'denied');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('profile', 'before', 'after', 'stay');--> statement-breakpoint
CREATE TYPE "public"."promptpay_type" AS ENUM('phone', 'national_id', 'tax_id', 'ewallet');--> statement-breakpoint
CREATE TYPE "public"."rate_channel" AS ENUM('all', 'walk_in', 'line', 'ota');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('shop', 'customer', 'import');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refund_mode" AS ENUM('bank_transfer', 'cash', 'credit');--> statement-breakpoint
CREATE TYPE "public"."report_card_kind" AS ENUM('grooming', 'stay');--> statement-breakpoint
CREATE TYPE "public"."report_card_status" AS ENUM('draft', 'pending_review', 'sent');--> statement-breakpoint
CREATE TYPE "public"."room_unit_status" AS ENUM('active', 'maintenance', 'archived');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('bath', 'haircut', 'spa', 'nail', 'ear', 'teeth', 'deshed', 'other', 'hotel_addon', 'daycare_addon');--> statement-breakpoint
CREATE TYPE "public"."service_scope" AS ENUM('grooming', 'hotel', 'daycare');--> statement-breakpoint
CREATE TYPE "public"."session_subject" AS ENUM('staff', 'customer', 'platform_admin');--> statement-breakpoint
CREATE TYPE "public"."skin_condition" AS ENUM('normal', 'dry', 'redness', 'lesion');--> statement-breakpoint
CREATE TYPE "public"."slip_status" AS ENUM('submitted', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."species" AS ENUM('dog', 'cat', 'other');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'front_desk', 'staff');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."stay_status" AS ENUM('reserved', 'checked_in', 'checked_out', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."teeth_condition" AS ENUM('ok', 'tartar', 'bad_breath');--> statement-breakpoint
CREATE TYPE "public"."temperament_flag" AS ENUM('bites', 'needs_muzzle', 'dryer_fear', 'noise_sensitive', 'same_groomer_only', 'dog_reactive', 'cat_reactive', 'anxious', 'other');--> statement-breakpoint
CREATE TYPE "public"."vaccine_status" AS ENUM('pending_review', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"booking_slug" text NOT NULL,
	"phone" text,
	"address_line" text,
	"subdistrict" text,
	"district" text,
	"province" text,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"logo_file_id" uuid,
	"facebook_url" text,
	"instagram_url" text,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"module_grooming" boolean DEFAULT true NOT NULL,
	"module_hotel" boolean DEFAULT false NOT NULL,
	"module_daycare" boolean DEFAULT false NOT NULL,
	"promptpay_type" "promptpay_type",
	"promptpay_id" text,
	"promptpay_account_name" text,
	"receipt_prefix" text DEFAULT 'R' NOT NULL,
	"receipt_year_be" integer DEFAULT 0 NOT NULL,
	"receipt_next_seq" integer DEFAULT 1 NOT NULL,
	"booking_seq_month" text DEFAULT '' NOT NULL,
	"booking_next_seq" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_receipt_prefix_chk" CHECK (receipt_prefix ~ '^[A-Z]{1,3}$')
);
--> statement-breakpoint
CREATE TABLE "branch_closure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"scope" "closure_scope" DEFAULT 'all' NOT NULL,
	"source" "closure_source" DEFAULT 'manual' NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_closure_range_chk" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE "branch_hours" (
	"branch_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_hours_branch_id_weekday_pk" PRIMARY KEY("branch_id","weekday"),
	CONSTRAINT "branch_hours_weekday_chk" CHECK (weekday between 0 and 6),
	CONSTRAINT "branch_hours_range_chk" CHECK (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);
--> statement-breakpoint
CREATE TABLE "branch_policy" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"default_deposit_type" "deposit_type" DEFAULT 'none' NOT NULL,
	"default_deposit_value" integer DEFAULT 0 NOT NULL,
	"grooming_free_cancel_hours" integer DEFAULT 24 NOT NULL,
	"hotel_free_cancel_hours" integer DEFAULT 72 NOT NULL,
	"daycare_free_cancel_hours" integer DEFAULT 24 NOT NULL,
	"late_cancel_forfeit_percent" integer DEFAULT 100 NOT NULL,
	"cancel_refund_mode" "cancel_refund_mode" DEFAULT 'credit' NOT NULL,
	"booking_lead_minutes" integer DEFAULT 120 NOT NULL,
	"booking_horizon_days" integer DEFAULT 60 NOT NULL,
	"reschedule_cutoff_hours" integer DEFAULT 24 NOT NULL,
	"no_show_grace_minutes" integer DEFAULT 30 NOT NULL,
	"slot_step_minutes" integer DEFAULT 15 NOT NULL,
	"buffer_minutes" integer DEFAULT 10 NOT NULL,
	"max_appointments_per_day" integer,
	"max_appointments_per_groomer_day" integer,
	"hold_minutes" integer DEFAULT 15 NOT NULL,
	"approval_timeout_minutes" integer DEFAULT 120 NOT NULL,
	"auto_confirm_grooming" boolean DEFAULT true NOT NULL,
	"auto_confirm_hotel" boolean DEFAULT false NOT NULL,
	"auto_confirm_daycare" boolean DEFAULT true NOT NULL,
	"required_vaccines_dog" text[] DEFAULT '{}' NOT NULL,
	"required_vaccines_cat" text[] DEFAULT '{}' NOT NULL,
	"enforce_vaccines_grooming" boolean DEFAULT false NOT NULL,
	"rejected_breeds" text[] DEFAULT '{}' NOT NULL,
	"max_pet_weight_grams" integer,
	"grooming_consent_text" text DEFAULT '' NOT NULL,
	"boarding_agreement_text" text DEFAULT '' NOT NULL,
	"policy_text" text DEFAULT '' NOT NULL,
	"reminder_24h_enabled" boolean DEFAULT true NOT NULL,
	"economy_mode" boolean DEFAULT false NOT NULL,
	"next_groom_default_days" integer DEFAULT 28 NOT NULL,
	"google_review_url" text,
	"report_card_requires_review" boolean DEFAULT false NOT NULL,
	"daily_summary_time" time DEFAULT '20:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_percent_chk" CHECK (late_cancel_forfeit_percent between 0 and 100),
	CONSTRAINT "policy_step_chk" CHECK (slot_step_minutes in (5,10,15,30)),
	CONSTRAINT "policy_deposit_chk" CHECK (default_deposit_value >= 0 and (default_deposit_type <> 'percent' or default_deposit_value <= 100))
);
--> statement-breakpoint
CREATE TABLE "groom_station" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "org_status" DEFAULT 'pilot' NOT NULL,
	"default_locale" text DEFAULT 'th' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_holiday" (
	"holiday_date" date PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"subject_type" "session_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"organization_id" uuid,
	"branch_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" text,
	"support_access_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sto_range_chk" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text,
	"password_hash" text,
	"display_name" text NOT NULL,
	"phone" text,
	"role" "staff_role" NOT NULL,
	"is_groomer" boolean DEFAULT false NOT NULL,
	"line_user_id" text,
	"photo_file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "staff_status" DEFAULT 'invited' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"break_starts_at" time,
	"break_ends_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swh_weekday_chk" CHECK (weekday between 0 and 6),
	CONSTRAINT "swh_range_chk" CHECK (ends_at > starts_at),
	CONSTRAINT "swh_break_chk" CHECK ((break_starts_at is null and break_ends_at is null) or (break_ends_at > break_starts_at and break_starts_at >= starts_at and break_ends_at <= ends_at))
);
--> statement-breakpoint
CREATE TABLE "web_push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"messaging_channel_id" text NOT NULL,
	"channel_secret_enc" text NOT NULL,
	"channel_access_token_enc" text NOT NULL,
	"login_channel_id" text NOT NULL,
	"liff_id" text NOT NULL,
	"bot_basic_id" text,
	"monthly_push_quota" integer DEFAULT 300 NOT NULL,
	"rich_menu_id" text,
	"webhook_verified_at" timestamp with time zone,
	"status" "line_channel_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"line_user_id" text NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"display_name" text,
	"picture_url" text,
	"is_friend" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"source_channel" "booking_channel" DEFAULT 'walk_in' NOT NULL,
	"referral_note" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"internal_note" text,
	"reliability_level" integer DEFAULT 3 NOT NULL,
	"reliability_override" integer,
	"late_cancel_count_12m" integer DEFAULT 0 NOT NULL,
	"no_show_count_12m" integer DEFAULT 0 NOT NULL,
	"blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" text,
	"deposit_exempt" boolean DEFAULT false NOT NULL,
	"photo_consent" "photo_consent" DEFAULT 'unknown' NOT NULL,
	"photo_consent_at" timestamp with time zone,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"first_visit_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"credit_balance_satang" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_rel_chk" CHECK (reliability_level between 1 and 4 and (reliability_override is null or reliability_override between 1 and 4)),
	CONSTRAINT "customer_credit_chk" CHECK (credit_balance_satang >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer_link_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"line_identity_id" uuid NOT NULL,
	"new_owner_profile_id" uuid NOT NULL,
	"candidate_customer_id" uuid NOT NULL,
	"phone_entered" text NOT NULL,
	"status" "link_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"kind" "file_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"uploaded_by_type" "actor_type" NOT NULL,
	"uploaded_by_id" uuid,
	"committed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_size_chk" CHECK (size_bytes > 0)
);
--> statement-breakpoint
CREATE TABLE "owner_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_in_org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"nickname" text,
	"phone_e164" text,
	"email" text,
	"birth_date" date,
	"address_line" text,
	"subdistrict" text,
	"district" text,
	"province" text,
	"postal_code" text,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"created_in_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" "species" NOT NULL,
	"species_other" text,
	"breed" text,
	"sex" "pet_sex" DEFAULT 'unknown' NOT NULL,
	"birth_date" date,
	"age_estimate_months" integer,
	"neutered" boolean,
	"color" text,
	"microchip_no" text,
	"coat_type" "coat_type" DEFAULT 'unknown' NOT NULL,
	"latest_weight_grams" integer,
	"profile_file_id" uuid,
	"status" "pet_status" DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_other_chk" CHECK (species <> 'other' or species_other is not null),
	CONSTRAINT "pet_weight_chk" CHECK (latest_weight_grams is null or latest_weight_grams > 0)
);
--> statement-breakpoint
CREATE TABLE "pet_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"appointment_id" uuid,
	"stay_id" uuid,
	"caption" text,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_shop_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"preferred_style" text,
	"blade_no" text,
	"shampoo_ok" text,
	"shampoo_avoid" text,
	"allergies" text,
	"conditions" text,
	"medications" text,
	"vet_clinic_name" text,
	"vet_clinic_phone" text,
	"internal_note" text,
	"shared_note" text,
	"favorite_style_photo_id" uuid,
	"groom_interval_days" integer,
	"last_groomed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_temperament_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"flag" "temperament_flag" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_vaccination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"vaccine_code" text NOT NULL,
	"administered_on" date,
	"expires_on" date NOT NULL,
	"proof_file_id" uuid,
	"status" "vaccine_status" DEFAULT 'pending_review' NOT NULL,
	"source" "record_source" DEFAULT 'shop' NOT NULL,
	"verified_org_id" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_weight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"weight_grams" integer NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "record_source" DEFAULT 'shop' NOT NULL,
	"recorded_by" uuid,
	"appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_weight_pos_chk" CHECK (weight_grams > 0)
);
--> statement-breakpoint
CREATE TABLE "vaccine_type" (
	"code" text PRIMARY KEY NOT NULL,
	"species" "species" NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text NOT NULL,
	"default_validity_months" integer DEFAULT 12 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"service_id" uuid,
	"staff_user_id" uuid,
	"type" "commission_type" NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_value_chk" CHECK (value >= 0 and (type <> 'percent' or value <= 10000))
);
--> statement-breakpoint
CREATE TABLE "daycare_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"size_tier_id" uuid,
	"price_satang" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daycare_session_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"session" "daycare_session" NOT NULL,
	"name_th" text NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"capacity" integer NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dst_cap_chk" CHECK (capacity > 0),
	CONSTRAINT "dst_range_chk" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE "package_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name_th" text NOT NULL,
	"service_id" uuid NOT NULL,
	"size_tier_id" uuid,
	"sessions_count" integer NOT NULL,
	"price_satang" integer NOT NULL,
	"validity_days" integer DEFAULT 365 NOT NULL,
	"share_scope" "package_share_scope" DEFAULT 'single_pet' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pkg_tpl_chk" CHECK (sessions_count >= 2 and price_satang > 0 and validity_days > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" text DEFAULT 'standard' NOT NULL,
	"name" text NOT NULL,
	"channel" "rate_channel" DEFAULT 'all' NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"size_tier_id" uuid,
	"nightly_price_satang" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_rate_chk" CHECK (nightly_price_satang >= 0)
);
--> statement-breakpoint
CREATE TABLE "room_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name_th" text NOT NULL,
	"description" text,
	"photo_file_id" uuid,
	"species_allowed" "species"[] DEFAULT '{}' NOT NULL,
	"max_weight_grams" integer,
	"min_age_months" integer,
	"allow_in_heat" boolean DEFAULT false NOT NULL,
	"allow_reactive" boolean DEFAULT false NOT NULL,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"included_text" text,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"zone" text,
	"status" "room_unit_status" DEFAULT 'active' NOT NULL,
	"housekeeping" "housekeeping_status" DEFAULT 'clean' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"scope" "service_scope" DEFAULT 'grooming' NOT NULL,
	"category" "service_category" NOT NULL,
	"name_th" text NOT NULL,
	"description" text,
	"photo_file_id" uuid,
	"species_allowed" "species"[] DEFAULT '{}' NOT NULL,
	"is_addon" boolean DEFAULT false NOT NULL,
	"addon_per_day" boolean DEFAULT false NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"est_cost_satang" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_addon_link" (
	"organization_id" uuid NOT NULL,
	"addon_service_id" uuid NOT NULL,
	"base_service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_addon_link_addon_service_id_base_service_id_pk" PRIMARY KEY("addon_service_id","base_service_id")
);
--> statement-breakpoint
CREATE TABLE "service_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"size_tier_id" uuid,
	"coat_group" "coat_group" DEFAULT 'any' NOT NULL,
	"price_satang" integer NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_price_chk" CHECK (price_satang >= 0 and duration_minutes >= 0 and duration_minutes <= 600)
);
--> statement-breakpoint
CREATE TABLE "size_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"species" "species" NOT NULL,
	"code" text NOT NULL,
	"label_th" text NOT NULL,
	"min_weight_grams" integer NOT NULL,
	"max_weight_grams" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "size_tier_range_chk" CHECK (min_weight_grams >= 0 and (max_weight_grams is null or max_weight_grams > min_weight_grams)),
	CONSTRAINT "size_tier_species_chk" CHECK (species in ('dog','cat'))
);
--> statement-breakpoint
CREATE TABLE "surcharge_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name_th" text NOT NULL,
	"default_amount_satang" integer DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_surcharge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"surcharge_type_id" uuid,
	"name" text NOT NULL,
	"amount_satang" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surcharge_amt_chk" CHECK (amount_satang > 0)
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"booking_no" text NOT NULL,
	"channel" "booking_channel" NOT NULL,
	"created_by_type" "actor_type" NOT NULL,
	"created_by_id" uuid,
	"status" "booking_status" NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"approval_due_at" timestamp with time zone,
	"estimated_total_satang" integer DEFAULT 0 NOT NULL,
	"deposit_required_satang" integer DEFAULT 0 NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'not_required' NOT NULL,
	"deposit_verified_satang" integer DEFAULT 0 NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"customer_note" text,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_type" "actor_type",
	"cancel_reason" text,
	"first_service_at" timestamp with time zone,
	"bill_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_amount_chk" CHECK (estimated_total_satang >= 0 and deposit_required_satang >= 0 and deposit_verified_satang >= 0)
);
--> statement-breakpoint
CREATE TABLE "booking_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"task_type" "care_task_type" NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"medication_id" uuid,
	"status" "care_task_status" DEFAULT 'pending' NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"note" text,
	"photo_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "consent_doc_kind" NOT NULL,
	"appointment_id" uuid,
	"stay_id" uuid,
	"customer_id" uuid NOT NULL,
	"reasons" text[] DEFAULT '{}' NOT NULL,
	"body_snapshot" text NOT NULL,
	"emergency_vet_limit_satang" integer,
	"signer_name" text NOT NULL,
	"signature_file_id" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_target_chk" CHECK ((appointment_id is not null) <> (stay_id is not null))
);
--> statement-breakpoint
CREATE TABLE "daycare_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"session_type_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"price_satang" integer NOT NULL,
	"status" "daycare_status" DEFAULT 'reserved' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groom_appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"groomer_id" uuid NOT NULL,
	"groomer_preference" "groomer_preference" DEFAULT 'any' NOT NULL,
	"station_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"status" "groom_status" DEFAULT 'scheduled' NOT NULL,
	"size_tier_id" uuid,
	"coat_group" "coat_group" DEFAULT 'any' NOT NULL,
	"weight_grams_at_booking" integer,
	"weight_grams_checkin" integer,
	"condition_flags" text[] DEFAULT '{}' NOT NULL,
	"condition_note" text,
	"services_total_satang" integer DEFAULT 0 NOT NULL,
	"surcharge_total_satang" integer DEFAULT 0 NOT NULL,
	"from_stay_id" uuid,
	"checked_in_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"staff_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga_time_chk" CHECK (ends_at > starts_at and blocked_until >= ends_at)
);
--> statement-breakpoint
CREATE TABLE "groom_appointment_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"is_addon" boolean DEFAULT false NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_satang" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"customer_package_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_unit_id" uuid NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"expected_check_in_time" time,
	"expected_check_out_time" time,
	"nights" integer NOT NULL,
	"nightly_price_satang" integer NOT NULL,
	"room_total_satang" integer NOT NULL,
	"status" "stay_status" DEFAULT 'reserved' NOT NULL,
	"in_heat" boolean DEFAULT false NOT NULL,
	"bundle_appointment_id" uuid,
	"weight_grams_in" integer,
	"weight_grams_out" integer,
	"vaccine_override_reason" text,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_dates_chk" CHECK (check_out_date > check_in_date and nights = (check_out_date - check_in_date))
);
--> statement-breakpoint
CREATE TABLE "stay_addon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_price_satang" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_satang" integer NOT NULL,
	"added_by_type" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_addon_chk" CHECK (quantity > 0 and total_satang = unit_price_satang * quantity)
);
--> statement-breakpoint
CREATE TABLE "stay_belonging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"item" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"photo_file_id" uuid,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_intake" (
	"stay_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"food_brand" text,
	"food_amount" text,
	"feeding_times" time[] DEFAULT '{}' NOT NULL,
	"food_provided_by_owner" boolean DEFAULT true NOT NULL,
	"walks_per_day" integer DEFAULT 0 NOT NULL,
	"condition_note" text,
	"condition_photo_ids" uuid[] DEFAULT '{}' NOT NULL,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"vet_clinic_name" text,
	"vet_clinic_phone" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_medication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" text NOT NULL,
	"times" time[] NOT NULL,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid,
	"receipt_no" text,
	"status" "bill_status" DEFAULT 'open' NOT NULL,
	"subtotal_satang" integer DEFAULT 0 NOT NULL,
	"bill_discount_satang" integer DEFAULT 0 NOT NULL,
	"bill_discount_reason" text,
	"total_satang" integer DEFAULT 0 NOT NULL,
	"paid_satang" integer DEFAULT 0 NOT NULL,
	"change_satang" integer DEFAULT 0 NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_total_chk" CHECK (total_satang = subtotal_satang - bill_discount_satang and total_satang >= 0),
	CONSTRAINT "bill_paid_chk" CHECK (status <> 'paid' or paid_satang = total_satang)
);
--> statement-breakpoint
CREATE TABLE "bill_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"line_type" "bill_line_type" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"description" text NOT NULL,
	"pet_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_satang" integer NOT NULL,
	"line_discount_satang" integer DEFAULT 0 NOT NULL,
	"line_discount_reason" text,
	"line_total_satang" integer NOT NULL,
	"performer_id" uuid,
	"commission_base_satang" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_line_total_chk" CHECK (line_total_satang = quantity * unit_price_satang - line_discount_satang and line_total_satang >= 0 and quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "commission_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"bill_line_id" uuid NOT NULL,
	"base_satang" integer NOT NULL,
	"rule_id" uuid,
	"amount_satang" integer NOT NULL,
	"status" "commission_status" DEFAULT 'earned' NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"delta_satang" integer NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_delta_chk" CHECK (delta_satang <> 0)
);
--> statement-breakpoint
CREATE TABLE "customer_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"pet_id" uuid,
	"sessions_total" integer NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"unit_value_satang" integer NOT NULL,
	"purchased_bill_id" uuid NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "customer_package_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cpkg_chk" CHECK (sessions_used >= 0 and sessions_used <= sessions_total)
);
--> statement-breakpoint
CREATE TABLE "package_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_package_id" uuid NOT NULL,
	"bill_line_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"performer_id" uuid,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid,
	"bill_id" uuid,
	"method" "payment_method" NOT NULL,
	"amount_satang" integer NOT NULL,
	"tendered_satang" integer,
	"slip_id" uuid,
	"proof_file_id" uuid,
	"reference" text,
	"received_by" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "payment_status" DEFAULT 'posted' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amt_chk" CHECK (amount_satang > 0),
	CONSTRAINT "payment_target_chk" CHECK (booking_id is not null or bill_id is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_slip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid,
	"bill_id" uuid,
	"file_id" uuid NOT NULL,
	"uploaded_by_type" "actor_type" NOT NULL,
	"amount_expected_satang" integer NOT NULL,
	"qr_payload" text,
	"trans_ref" text,
	"duplicate_of_slip_id" uuid,
	"status" "slip_status" DEFAULT 'submitted' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid,
	"bill_id" uuid,
	"customer_id" uuid NOT NULL,
	"amount_satang" integer NOT NULL,
	"mode" "refund_mode" NOT NULL,
	"reason" text NOT NULL,
	"proof_file_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_amt_chk" CHECK (amount_satang > 0)
);
--> statement-breakpoint
CREATE TABLE "report_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"kind" "report_card_kind" NOT NULL,
	"appointment_id" uuid,
	"stay_id" uuid,
	"pet_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"skin" "skin_condition",
	"ears" "ear_condition",
	"nails" "nail_condition",
	"teeth" "teeth_condition",
	"parasites" "parasite_finding",
	"cooperation" integer,
	"staff_note" text,
	"recommendation" text,
	"status" "report_card_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"customer_rating" integer,
	"customer_feedback" text,
	"rated_at" timestamp with time zone,
	"google_review_clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rc_target_chk" CHECK ((appointment_id is not null) <> (stay_id is not null)),
	CONSTRAINT "rc_rating_chk" CHECK ((cooperation is null or cooperation between 1 and 5) and (customer_rating is null or customer_rating between 1 and 5))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"month_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"skip_reason" "notification_skip_reason",
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"job_type" "job_type" NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text,
	"support_access_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "consent_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"organization_id" uuid,
	"document" "legal_doc" NOT NULL,
	"version" text NOT NULL,
	"accepted" boolean NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"type" "data_request_type" NOT NULL,
	"status" "data_request_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"message" text NOT NULL,
	"screenshot_file_id" uuid,
	"app_version" text,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "import_status" DEFAULT 'validating' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform_admin_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ticket_ref" text,
	"read_only" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_logo_file_id_file_object_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_closure" ADD CONSTRAINT "branch_closure_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_closure" ADD CONSTRAINT "branch_closure_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_policy" ADD CONSTRAINT "branch_policy_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_station" ADD CONSTRAINT "groom_station_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_station" ADD CONSTRAINT "groom_station_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD CONSTRAINT "staff_invite_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD CONSTRAINT "staff_invite_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD CONSTRAINT "staff_invite_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ADD CONSTRAINT "staff_working_hours_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ADD CONSTRAINT "staff_working_hours_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ADD CONSTRAINT "staff_working_hours_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscription" ADD CONSTRAINT "web_push_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscription" ADD CONSTRAINT "web_push_subscription_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_channel" ADD CONSTRAINT "line_channel_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_channel" ADD CONSTRAINT "line_channel_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_identity" ADD CONSTRAINT "line_identity_owner_profile_id_owner_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."owner_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_owner_profile_id_owner_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."owner_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_link_request" ADD CONSTRAINT "customer_link_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_link_request" ADD CONSTRAINT "customer_link_request_line_identity_id_line_identity_id_fk" FOREIGN KEY ("line_identity_id") REFERENCES "public"."line_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_link_request" ADD CONSTRAINT "customer_link_request_new_owner_profile_id_owner_profile_id_fk" FOREIGN KEY ("new_owner_profile_id") REFERENCES "public"."owner_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_link_request" ADD CONSTRAINT "customer_link_request_candidate_customer_id_customer_id_fk" FOREIGN KEY ("candidate_customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_link_request" ADD CONSTRAINT "customer_link_request_decided_by_staff_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_profile" ADD CONSTRAINT "owner_profile_created_in_org_id_organization_id_fk" FOREIGN KEY ("created_in_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_owner_profile_id_owner_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."owner_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_created_in_org_id_organization_id_fk" FOREIGN KEY ("created_in_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_profile_file_id_file_object_id_fk" FOREIGN KEY ("profile_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_photo" ADD CONSTRAINT "pet_photo_uploaded_by_staff_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop_profile" ADD CONSTRAINT "pet_shop_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop_profile" ADD CONSTRAINT "pet_shop_profile_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop_profile" ADD CONSTRAINT "pet_shop_profile_favorite_style_photo_id_pet_photo_id_fk" FOREIGN KEY ("favorite_style_photo_id") REFERENCES "public"."pet_photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_temperament_flag" ADD CONSTRAINT "pet_temperament_flag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_temperament_flag" ADD CONSTRAINT "pet_temperament_flag_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_temperament_flag" ADD CONSTRAINT "pet_temperament_flag_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccination" ADD CONSTRAINT "pet_vaccination_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccination" ADD CONSTRAINT "pet_vaccination_vaccine_code_vaccine_type_code_fk" FOREIGN KEY ("vaccine_code") REFERENCES "public"."vaccine_type"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccination" ADD CONSTRAINT "pet_vaccination_proof_file_id_file_object_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccination" ADD CONSTRAINT "pet_vaccination_verified_org_id_organization_id_fk" FOREIGN KEY ("verified_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccination" ADD CONSTRAINT "pet_vaccination_verified_by_staff_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_weight" ADD CONSTRAINT "pet_weight_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_weight" ADD CONSTRAINT "pet_weight_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_weight" ADD CONSTRAINT "pet_weight_recorded_by_staff_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_weight" ADD CONSTRAINT "pet_weight_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule" ADD CONSTRAINT "commission_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule" ADD CONSTRAINT "commission_rule_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule" ADD CONSTRAINT "commission_rule_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rule" ADD CONSTRAINT "commission_rule_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_rate" ADD CONSTRAINT "daycare_rate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_rate" ADD CONSTRAINT "daycare_rate_session_type_id_daycare_session_type_id_fk" FOREIGN KEY ("session_type_id") REFERENCES "public"."daycare_session_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_rate" ADD CONSTRAINT "daycare_rate_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_rate" ADD CONSTRAINT "daycare_rate_size_tier_id_size_tier_id_fk" FOREIGN KEY ("size_tier_id") REFERENCES "public"."size_tier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_session_type" ADD CONSTRAINT "daycare_session_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_session_type" ADD CONSTRAINT "daycare_session_type_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template" ADD CONSTRAINT "package_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template" ADD CONSTRAINT "package_template_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template" ADD CONSTRAINT "package_template_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template" ADD CONSTRAINT "package_template_size_tier_id_size_tier_id_fk" FOREIGN KEY ("size_tier_id") REFERENCES "public"."size_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate" ADD CONSTRAINT "room_rate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate" ADD CONSTRAINT "room_rate_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate" ADD CONSTRAINT "room_rate_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate" ADD CONSTRAINT "room_rate_size_tier_id_size_tier_id_fk" FOREIGN KEY ("size_tier_id") REFERENCES "public"."size_tier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_unit" ADD CONSTRAINT "room_unit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_unit" ADD CONSTRAINT "room_unit_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_unit" ADD CONSTRAINT "room_unit_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addon_link" ADD CONSTRAINT "service_addon_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addon_link" ADD CONSTRAINT "service_addon_link_addon_service_id_service_id_fk" FOREIGN KEY ("addon_service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addon_link" ADD CONSTRAINT "service_addon_link_base_service_id_service_id_fk" FOREIGN KEY ("base_service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price" ADD CONSTRAINT "service_price_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price" ADD CONSTRAINT "service_price_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price" ADD CONSTRAINT "service_price_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price" ADD CONSTRAINT "service_price_size_tier_id_size_tier_id_fk" FOREIGN KEY ("size_tier_id") REFERENCES "public"."size_tier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_tier" ADD CONSTRAINT "size_tier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_tier" ADD CONSTRAINT "size_tier_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_type" ADD CONSTRAINT "surcharge_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_type" ADD CONSTRAINT "surcharge_type_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_surcharge" ADD CONSTRAINT "appointment_surcharge_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_surcharge" ADD CONSTRAINT "appointment_surcharge_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_surcharge" ADD CONSTRAINT "appointment_surcharge_surcharge_type_id_surcharge_type_id_fk" FOREIGN KEY ("surcharge_type_id") REFERENCES "public"."surcharge_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_surcharge" ADD CONSTRAINT "appointment_surcharge_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_medication_id_stay_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."stay_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_done_by_staff_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_task" ADD CONSTRAINT "care_task_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_document" ADD CONSTRAINT "consent_document_signature_file_id_file_object_id_fk" FOREIGN KEY ("signature_file_id") REFERENCES "public"."file_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_visit" ADD CONSTRAINT "daycare_visit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_visit" ADD CONSTRAINT "daycare_visit_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_visit" ADD CONSTRAINT "daycare_visit_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_visit" ADD CONSTRAINT "daycare_visit_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_visit" ADD CONSTRAINT "daycare_visit_session_type_id_daycare_session_type_id_fk" FOREIGN KEY ("session_type_id") REFERENCES "public"."daycare_session_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_groomer_id_staff_user_id_fk" FOREIGN KEY ("groomer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_station_id_groom_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."groom_station"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_size_tier_id_size_tier_id_fk" FOREIGN KEY ("size_tier_id") REFERENCES "public"."size_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment" ADD CONSTRAINT "groom_appointment_from_stay_id_stay_id_fk" FOREIGN KEY ("from_stay_id") REFERENCES "public"."stay"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment_item" ADD CONSTRAINT "groom_appointment_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment_item" ADD CONSTRAINT "groom_appointment_item_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment_item" ADD CONSTRAINT "groom_appointment_item_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groom_appointment_item" ADD CONSTRAINT "groom_appointment_item_customer_package_id_customer_package_id_fk" FOREIGN KEY ("customer_package_id") REFERENCES "public"."customer_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_room_unit_id_room_unit_id_fk" FOREIGN KEY ("room_unit_id") REFERENCES "public"."room_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay" ADD CONSTRAINT "stay_bundle_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("bundle_appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_addon" ADD CONSTRAINT "stay_addon_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_addon" ADD CONSTRAINT "stay_addon_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_addon" ADD CONSTRAINT "stay_addon_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_belonging" ADD CONSTRAINT "stay_belonging_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_belonging" ADD CONSTRAINT "stay_belonging_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_belonging" ADD CONSTRAINT "stay_belonging_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_intake" ADD CONSTRAINT "stay_intake_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_intake" ADD CONSTRAINT "stay_intake_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_intake" ADD CONSTRAINT "stay_intake_completed_by_staff_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_medication" ADD CONSTRAINT "stay_medication_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_medication" ADD CONSTRAINT "stay_medication_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_opened_by_staff_user_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_closed_by_staff_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_voided_by_staff_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_performer_id_staff_user_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_bill_line_id_bill_line_id_fk" FOREIGN KEY ("bill_line_id") REFERENCES "public"."bill_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry" ADD CONSTRAINT "commission_entry_rule_id_commission_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_template_id_package_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."package_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_purchased_bill_id_bill_id_fk" FOREIGN KEY ("purchased_bill_id") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_redemption" ADD CONSTRAINT "package_redemption_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_redemption" ADD CONSTRAINT "package_redemption_customer_package_id_customer_package_id_fk" FOREIGN KEY ("customer_package_id") REFERENCES "public"."customer_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_redemption" ADD CONSTRAINT "package_redemption_bill_line_id_bill_line_id_fk" FOREIGN KEY ("bill_line_id") REFERENCES "public"."bill_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_redemption" ADD CONSTRAINT "package_redemption_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_redemption" ADD CONSTRAINT "package_redemption_performer_id_staff_user_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_slip_id_payment_slip_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."payment_slip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_proof_file_id_file_object_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_received_by_staff_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_voided_by_staff_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slip" ADD CONSTRAINT "payment_slip_reviewed_by_staff_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_proof_file_id_file_object_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_appointment_id_groom_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."groom_appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_stay_id_stay_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_pet_id_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_job" ADD CONSTRAINT "scheduled_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_owner_profile_id_owner_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."owner_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_report" ADD CONSTRAINT "feedback_report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_report" ADD CONSTRAINT "feedback_report_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_report" ADD CONSTRAINT "feedback_report_screenshot_file_id_file_object_id_fk" FOREIGN KEY ("screenshot_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_staff_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_log" ADD CONSTRAINT "support_access_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_log" ADD CONSTRAINT "support_access_log_platform_admin_id_platform_admin_id_fk" FOREIGN KEY ("platform_admin_id") REFERENCES "public"."platform_admin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_booking_slug_uq" ON "branch" USING btree ("booking_slug");--> statement-breakpoint
CREATE INDEX "branch_organization_id_idx" ON "branch" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "branch_closure_branch_id_starts_at_idx" ON "branch_closure" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE INDEX "groom_station_branch_id_idx" ON "groom_station" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uq" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_hash_uq" ON "password_reset" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admin_email_uq" ON "platform_admin" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_subject_type_subject_id_idx" ON "session" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invite_token_hash_uq" ON "staff_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_time_off_staff_user_id_starts_at_idx" ON "staff_time_off" USING btree ("staff_user_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_email_uq" ON "staff_user" USING btree ("email") WHERE email is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_line_user_id_uq" ON "staff_user" USING btree ("line_user_id") WHERE line_user_id is not null;--> statement-breakpoint
CREATE INDEX "staff_user_organization_id_idx" ON "staff_user" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_working_hours_staff_user_id_branch_id_weekday_uq" ON "staff_working_hours" USING btree ("staff_user_id","branch_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "web_push_subscription_endpoint_uq" ON "web_push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "web_push_subscription_staff_user_id_idx" ON "web_push_subscription" USING btree ("staff_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "line_channel_branch_id_uq" ON "line_channel" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "line_channel_messaging_channel_id_uq" ON "line_channel" USING btree ("messaging_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "line_identity_provider_id_line_user_id_uq" ON "line_identity" USING btree ("provider_id","line_user_id");--> statement-breakpoint
CREATE INDEX "line_identity_owner_profile_id_idx" ON "line_identity" USING btree ("owner_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_organization_id_owner_profile_id_uq" ON "customer" USING btree ("organization_id","owner_profile_id");--> statement-breakpoint
CREATE INDEX "customer_organization_id_last_visit_at_idx" ON "customer" USING btree ("organization_id","last_visit_at");--> statement-breakpoint
CREATE INDEX "customer_link_request_organization_id_status_idx" ON "customer_link_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "file_object_storage_key_uq" ON "file_object" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_object_organization_id_kind_idx" ON "file_object" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "owner_profile_created_in_org_id_phone_e164_idx" ON "owner_profile" USING btree ("created_in_org_id","phone_e164");--> statement-breakpoint
CREATE INDEX "pet_owner_profile_id_idx" ON "pet" USING btree ("owner_profile_id");--> statement-breakpoint
CREATE INDEX "pet_photo_pet_id_taken_at_idx" ON "pet_photo" USING btree ("pet_id","taken_at");--> statement-breakpoint
CREATE INDEX "pet_photo_stay_id_idx" ON "pet_photo" USING btree ("stay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_shop_profile_organization_id_pet_id_uq" ON "pet_shop_profile" USING btree ("organization_id","pet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_temperament_flag_organization_id_pet_id_flag_uq" ON "pet_temperament_flag" USING btree ("organization_id","pet_id","flag");--> statement-breakpoint
CREATE INDEX "pet_vaccination_pet_id_vaccine_code_expires_on_idx" ON "pet_vaccination" USING btree ("pet_id","vaccine_code","expires_on");--> statement-breakpoint
CREATE INDEX "pet_weight_pet_id_measured_at_idx" ON "pet_weight" USING btree ("pet_id","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rule_branch_id_service_id_staff_user_id_uq" ON "commission_rule" USING btree ("branch_id","service_id","staff_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daycare_rate_session_type_id_rate_plan_id_size_tier_id_uq" ON "daycare_rate" USING btree ("session_type_id","rate_plan_id","size_tier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daycare_session_type_branch_id_session_uq" ON "daycare_session_type" USING btree ("branch_id","session");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plan_branch_id_code_uq" ON "rate_plan" USING btree ("branch_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plan_branch_id_uq" ON "rate_plan" USING btree ("branch_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "room_rate_room_type_id_rate_plan_id_size_tier_id_uq" ON "room_rate" USING btree ("room_type_id","rate_plan_id","size_tier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_unit_branch_id_code_uq" ON "room_unit" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "service_branch_id_scope_status_idx" ON "service" USING btree ("branch_id","scope","status");--> statement-breakpoint
CREATE UNIQUE INDEX "service_price_service_id_rate_plan_id_size_tier_id_coat__91868e" ON "service_price" USING btree ("service_id","rate_plan_id","size_tier_id","coat_group");--> statement-breakpoint
CREATE UNIQUE INDEX "size_tier_branch_id_species_code_uq" ON "size_tier" USING btree ("branch_id","species","code");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_branch_id_booking_no_uq" ON "booking" USING btree ("branch_id","booking_no");--> statement-breakpoint
CREATE INDEX "booking_organization_id_customer_id_idx" ON "booking" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "booking_branch_id_status_idx" ON "booking" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "booking_event_booking_id_created_at_idx" ON "booking_event" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_event_organization_id_created_at_idx" ON "booking_event" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "care_task_branch_id_due_at_status_idx" ON "care_task" USING btree ("branch_id","due_at","status");--> statement-breakpoint
CREATE INDEX "care_task_stay_id_due_at_idx" ON "care_task" USING btree ("stay_id","due_at");--> statement-breakpoint
CREATE INDEX "daycare_visit_branch_id_visit_date_session_type_id_idx" ON "daycare_visit" USING btree ("branch_id","visit_date","session_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daycare_visit_pet_id_visit_date_session_type_id_uq" ON "daycare_visit" USING btree ("pet_id","visit_date","session_type_id") WHERE status not in ('cancelled','no_show');--> statement-breakpoint
CREATE INDEX "groom_appointment_branch_id_starts_at_idx" ON "groom_appointment" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE INDEX "groom_appointment_groomer_id_starts_at_idx" ON "groom_appointment" USING btree ("groomer_id","starts_at");--> statement-breakpoint
CREATE INDEX "groom_appointment_pet_id_starts_at_idx" ON "groom_appointment" USING btree ("pet_id","starts_at");--> statement-breakpoint
CREATE INDEX "groom_appointment_item_appointment_id_idx" ON "groom_appointment_item" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "stay_branch_id_check_in_date_idx" ON "stay" USING btree ("branch_id","check_in_date");--> statement-breakpoint
CREATE INDEX "stay_branch_id_check_out_date_idx" ON "stay" USING btree ("branch_id","check_out_date");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_branch_id_receipt_no_uq" ON "bill" USING btree ("branch_id","receipt_no") WHERE receipt_no is not null;--> statement-breakpoint
CREATE INDEX "bill_branch_id_closed_at_idx" ON "bill" USING btree ("branch_id","closed_at");--> statement-breakpoint
CREATE INDEX "bill_customer_id_idx" ON "bill" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bill_line_bill_id_idx" ON "bill_line" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "commission_entry_staff_user_id_earned_at_idx" ON "commission_entry" USING btree ("staff_user_id","earned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entry_bill_line_id_uq" ON "commission_entry" USING btree ("bill_line_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_customer_id_created_at_idx" ON "credit_ledger" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_package_customer_id_status_idx" ON "customer_package" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "payment_bill_id_idx" ON "payment" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "payment_booking_id_idx" ON "payment" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_branch_id_received_at_idx" ON "payment" USING btree ("branch_id","received_at");--> statement-breakpoint
CREATE INDEX "payment_slip_organization_id_trans_ref_idx" ON "payment_slip" USING btree ("organization_id","trans_ref") WHERE trans_ref is not null;--> statement-breakpoint
CREATE INDEX "payment_slip_branch_id_status_idx" ON "payment_slip" USING btree ("branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "report_card_appointment_id_uq" ON "report_card" USING btree ("appointment_id") WHERE appointment_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_card_stay_id_uq" ON "report_card" USING btree ("stay_id") WHERE stay_id is not null;--> statement-breakpoint
CREATE INDEX "report_card_customer_id_idx" ON "report_card" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_key_uq" ON "notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_branch_id_month_key_channel_status_idx" ON "notification" USING btree ("branch_id","month_key","channel","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_job_dedupe_key_uq" ON "scheduled_job" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "scheduled_job_status_run_at_idx" ON "scheduled_job" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "consent_record_subject_type_subject_id_document_idx" ON "consent_record" USING btree ("subject_type","subject_id","document");