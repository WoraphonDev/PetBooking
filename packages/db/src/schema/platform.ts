// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fileObject } from "./customers";
import {
  cancelRefundModeEnum,
  closureScopeEnum,
  closureSourceEnum,
  depositTypeEnum,
  orgStatusEnum,
  promptpayTypeEnum,
  recordStatusEnum,
} from "./enums";
import { staffUser } from "./identity";

/** ธุรกิจ (tenant) 1 รายต่อ 1 record — US-13-02, US-13-10 */
export const organization = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ชื่อธุรกิจ */
    name: text("name").notNull(),
    /** a-z0-9- ยาว 3–40, unique ทั้งระบบ */
    slug: text("slug").notNull(),
    /** pilot = นำร่องฟรี */
    status: orgStatusEnum("status").notNull().default("pilot"),
    /** 'th' ใน MVP */
    defaultLocale: text("default_locale").notNull().default("th"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("organization_slug_uq").on(t.slug)],
);

/** สาขา/หน้าร้าน (MVP มี 1 สาขาต่อธุรกิจ แต่ทุกตารางอ้างได้) — US-02-01, US-02-02, US-02-03 */
export const branch = pgTable(
  "branch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    /** ชื่อร้านที่ลูกค้าเห็น */
    name: text("name").notNull(),
    /** ใช้ใน URL จอง /b/{booking_slug} unique ทั้งระบบ */
    bookingSlug: text("booking_slug").notNull(),
    /** E.164 เช่น +66812345678 */
    phone: text("phone"),
    /** บ้านเลขที่/ถนน */
    addressLine: text("address_line"),
    /** ตำบล/แขวง */
    subdistrict: text("subdistrict"),
    /** อำเภอ/เขต */
    district: text("district"),
    /** จังหวัด */
    province: text("province"),
    /** 5 หลัก */
    postalCode: text("postal_code"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    logoFileId: uuid("logo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    facebookUrl: text("facebook_url"),
    instagramUrl: text("instagram_url"),
    /** IANA tz ใช้คำนวณวันที่ท้องถิ่นทั้งหมด */
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    /** เปิดโมดูลกรูม */
    moduleGrooming: boolean("module_grooming").notNull().default(true),
    /** เปิดโมดูลโรงแรม */
    moduleHotel: boolean("module_hotel").notNull().default(false),
    /** เปิดโมดูล Daycare */
    moduleDaycare: boolean("module_daycare").notNull().default(false),
    /** ประเภท PromptPay ID */
    promptpayType: promptpayTypeEnum("promptpay_type"),
    /** เก็บแบบตัวเลขล้วน (เบอร์ 10 หลัก / 13 หลัก) */
    promptpayId: text("promptpay_id"),
    /** ชื่อบัญชีที่ลูกค้าเห็นก่อนโอน */
    promptpayAccountName: text("promptpay_account_name"),
    /** คำนำหน้าเลขใบเสร็จ A-Z 1–3 ตัว */
    receiptPrefix: text("receipt_prefix").notNull().default("R"),
    /** ปี พ.ศ. ของ counter ปัจจุบัน (รีเซ็ตเลขเมื่อขึ้นปีใหม่) — R-16 */
    receiptYearBe: integer("receipt_year_be").notNull().default(0),
    /** เลขลำดับถัดไป — ล็อกแถวก่อนใช้ (R-16) */
    receiptNextSeq: integer("receipt_next_seq").notNull().default(1),
    /** YYMM ของ counter เลขใบจอง */
    bookingSeqMonth: text("booking_seq_month").notNull().default(""),
    /** เลขลำดับใบจองถัดไป (R-23) */
    bookingNextSeq: integer("booking_next_seq").notNull().default(1),
    status: recordStatusEnum("status").notNull().default("active"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("branch_booking_slug_uq").on(t.bookingSlug),
    index("branch_organization_id_idx").on(t.organizationId),
    check("branch_receipt_prefix_chk", sql`receipt_prefix ~ '^[A-Z]{1,3}$'`),
  ],
);

/** เวลาเปิด-ปิดรายวันของสาขา (1 ช่วงต่อวัน) — US-02-01 */
export const branchHours = pgTable(
  "branch_hours",
  {
    /** สาขา */
    branchId: uuid("branch_id")
      .notNull()
      .references((): AnyPgColumn => branch.id),
    /** 0=อาทิตย์ … 6=เสาร์ */
    weekday: integer("weekday").notNull(),
    /** ปิดทั้งวัน */
    isClosed: boolean("is_closed").notNull().default(false),
    /** เวลาท้องถิ่น เช่น 09:00 (null ถ้า is_closed) */
    opensAt: time("opens_at"),
    /** ต้องมากกว่า opens_at */
    closesAt: time("closes_at"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.weekday] }),
    check("branch_hours_weekday_chk", sql`weekday between 0 and 6`),
    check("branch_hours_range_chk", sql`is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at)`),
  ],
);

/** ช่วงปิดร้าน/ปิดบางโมดูล — US-02-05 */
export const branchClosure = pgTable(
  "branch_closure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** สาขา */
    branchId: uuid("branch_id")
      .notNull()
      .references((): AnyPgColumn => branch.id),
    /** UTC */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    /** UTC (exclusive) */
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    /** ปิดทั้งร้านหรือเฉพาะโมดูล */
    scope: closureScopeEnum("scope").notNull().default("all"),
    source: closureSourceEnum("source").notNull().default("manual"),
    reason: text("reason"),
    createdBy: uuid("created_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("branch_closure_branch_id_starts_at_idx").on(t.branchId, t.startsAt),
    check("branch_closure_range_chk", sql`ends_at > starts_at`),
  ],
);

/** นโยบายและค่าตั้งต้นของสาขา (1:1 กับ branch) — US-02-04, US-07-03, US-07-04, US-05-01, US-13-06 */
export const branchPolicy = pgTable(
  "branch_policy",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references((): AnyPgColumn => branch.id, { onDelete: "cascade" }),
    defaultDepositType: depositTypeEnum("default_deposit_type").notNull().default("none"),
    /** fixed = satang, percent = 0–100 */
    defaultDepositValue: integer("default_deposit_value").notNull().default(0),
    /** ยกเลิกก่อนนัด ≥ ค่านี้ = ไม่ริบ */
    groomingFreeCancelHours: integer("grooming_free_cancel_hours").notNull().default(24),
    hotelFreeCancelHours: integer("hotel_free_cancel_hours").notNull().default(72),
    daycareFreeCancelHours: integer("daycare_free_cancel_hours").notNull().default(24),
    /** ยกเลิกกระชั้น ริบกี่ % ของมัดจำ */
    lateCancelForfeitPercent: integer("late_cancel_forfeit_percent").notNull().default(100),
    /** ส่วนที่ไม่ริบ คืนเงินหรือเครดิต */
    cancelRefundMode: cancelRefundModeEnum("cancel_refund_mode").notNull().default("credit"),
    /** จองออนไลน์ล่วงหน้าขั้นต่ำ */
    bookingLeadMinutes: integer("booking_lead_minutes").notNull().default(120),
    /** จองล่วงหน้าได้ไกลสุด */
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(60),
    /** ลูกค้าเลื่อน/ยกเลิกเองได้ถึงกี่ ชม. ก่อนนัด */
    rescheduleCutoffHours: integer("reschedule_cutoff_hours").notNull().default(24),
    /** กด no-show ได้หลังเวลานัด + ค่านี้ */
    noShowGraceMinutes: integer("no_show_grace_minutes").notNull().default(30),
    /** ความละเอียดเวลาเริ่ม 5/10/15/30 */
    slotStepMinutes: integer("slot_step_minutes").notNull().default(15),
    /** เวลาทำความสะอาดหลังแต่ละนัด */
    bufferMinutes: integer("buffer_minutes").notNull().default(10),
    /** null = ไม่จำกัด */
    maxAppointmentsPerDay: integer("max_appointments_per_day"),
    maxAppointmentsPerGroomerDay: integer("max_appointments_per_groomer_day"),
    /** ล็อกคิวระหว่างจ่ายมัดจำ */
    holdMinutes: integer("hold_minutes").notNull().default(15),
    /** เตือนร้านซ้ำถ้ายังไม่อนุมัติ */
    approvalTimeoutMinutes: integer("approval_timeout_minutes").notNull().default(120),
    autoConfirmGrooming: boolean("auto_confirm_grooming").notNull().default(true),
    autoConfirmHotel: boolean("auto_confirm_hotel").notNull().default(false),
    autoConfirmDaycare: boolean("auto_confirm_daycare").notNull().default(true),
    /** รหัสจาก vaccine_type */
    requiredVaccinesDog: text("required_vaccines_dog").array().notNull().default(sql`'{}'`),
    requiredVaccinesCat: text("required_vaccines_cat").array().notNull().default(sql`'{}'`),
    /** บังคับวัคซีนกับกรูมด้วยหรือไม่ */
    enforceVaccinesGrooming: boolean("enforce_vaccines_grooming").notNull().default(false),
    /** สายพันธุ์ที่ไม่รับ (ข้อความตรงกับ pet.breed) */
    rejectedBreeds: text("rejected_breeds").array().notNull().default(sql`'{}'`),
    maxPetWeightGrams: integer("max_pet_weight_grams"),
    /** แม่แบบใบยินยอมก่อนกรูม */
    groomingConsentText: text("grooming_consent_text").notNull().default(""),
    /** แม่แบบข้อตกลงรับฝาก */
    boardingAgreementText: text("boarding_agreement_text").notNull().default(""),
    /** นโยบายที่แสดงให้ลูกค้าก่อนยืนยันจอง */
    policyText: text("policy_text").notNull().default(""),
    reminder24hEnabled: boolean("reminder_24h_enabled").notNull().default(true),
    /** โหมดประหยัดข้อความ LINE (R-18) */
    economyMode: boolean("economy_mode").notNull().default(false),
    /** รอบกรูมตั้งต้น */
    nextGroomDefaultDays: integer("next_groom_default_days").notNull().default(28),
    /** ลิงก์รีวิว Google ของร้าน */
    googleReviewUrl: text("google_review_url"),
    /** ต้องให้หน้าร้านตรวจก่อนส่ง */
    reportCardRequiresReview: boolean("report_card_requires_review").notNull().default(false),
    /** เวลาส่งสรุปรายวัน (ท้องถิ่น) */
    dailySummaryTime: time("daily_summary_time").notNull().default("20:00"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("policy_percent_chk", sql`late_cancel_forfeit_percent between 0 and 100`),
    check("policy_step_chk", sql`slot_step_minutes in (5,10,15,30)`),
    check("policy_deposit_chk", sql`default_deposit_value >= 0 and (default_deposit_type <> 'percent' or default_deposit_value <= 100)`),
  ],
);

/** วันหยุดราชการไทย (ข้อมูลกลาง seed ปีละครั้ง) — US-13-03 */
export const publicHoliday = pgTable("public_holiday", {
  holidayDate: date("holiday_date", { mode: "string" }).primaryKey(),
  nameTh: text("name_th").notNull(),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** โต๊ะกรูม (จำนวนนัดพร้อมกันสูงสุด = จำนวนโต๊ะ active) — US-05-01 */
export const groomStation = pgTable(
  "groom_station",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    /** สาขา */
    branchId: uuid("branch_id")
      .notNull()
      .references((): AnyPgColumn => branch.id),
    /** เช่น โต๊ะ 1 */
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: recordStatusEnum("status").notNull().default("active"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("groom_station_branch_id_idx").on(t.branchId)],
);
