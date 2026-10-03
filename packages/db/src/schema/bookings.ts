// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { customerPackage } from "./billing";
import { daycareSessionType, roomType, roomUnit, service, sizeTier, surchargeType } from "./catalog";
import { customer, fileObject, pet } from "./customers";
import {
  actorTypeEnum,
  bookingChannelEnum,
  bookingStatusEnum,
  careTaskStatusEnum,
  careTaskTypeEnum,
  coatGroupEnum,
  consentDocKindEnum,
  daycareStatusEnum,
  depositStatusEnum,
  groomerPreferenceEnum,
  groomStatusEnum,
  stayStatusEnum,
} from "./enums";
import { staffUser } from "./identity";
import { branch, groomStation, organization } from "./platform";

/** ใบจอง (header) — 1 ใบมีได้หลายนัด/หลายการพัก — US-05-04, US-11-03, US-07-03, US-07-04 */
export const booking = pgTable(
  "booking",
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
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    /** R-23 เช่น B6910-0042 unique ต่อสาขา */
    bookingNo: text("booking_no").notNull(),
    channel: bookingChannelEnum("channel").notNull(),
    createdByType: actorTypeEnum("created_by_type").notNull(),
    createdById: uuid("created_by_id"),
    /** ดู 03-state-machines */
    status: bookingStatusEnum("status").notNull(),
    /** มีค่าเมื่อ status = awaiting_deposit */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true, mode: "date" }),
    /** มีค่าเมื่อ awaiting_approval */
    approvalDueAt: timestamp("approval_due_at", { withTimezone: true, mode: "date" }),
    /** ยอดประเมินตอนจอง */
    estimatedTotalSatang: integer("estimated_total_satang").notNull().default(0),
    /** R-06 */
    depositRequiredSatang: integer("deposit_required_satang").notNull().default(0),
    depositStatus: depositStatusEnum("deposit_status").notNull().default("not_required"),
    /** ยอดที่ร้านยืนยันแล้ว */
    depositVerifiedSatang: integer("deposit_verified_satang").notNull().default(0),
    /** สำเนานโยบายยกเลิก/มัดจำ ณ เวลาจอง (R-07 ใช้ค่านี้เสมอ) */
    policySnapshot: jsonb("policy_snapshot").notNull(),
    customerNote: text("customer_note"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancelledByType: actorTypeEnum("cancelled_by_type"),
    cancelReason: text("cancel_reason"),
    /** R-07 isLate ตอนยกเลิก (Q-0084); null = ไม่ได้ยกเลิก — R-09 นับ late cancel จากคอลัมน์นี้ */
    cancelIsLate: boolean("cancel_is_late"),
    /** cache เวลาเริ่มบริการแรก (ใช้คำนวณยกเลิก) */
    firstServiceAt: timestamp("first_service_at", { withTimezone: true, mode: "date" }),
    /** บิลที่ปิดใบจองนี้ (FK ใส่ใน SQL custom) */
    billId: uuid("bill_id"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("booking_branch_id_booking_no_uq").on(t.branchId, t.bookingNo),
    index("booking_organization_id_customer_id_idx").on(t.organizationId, t.customerId),
    index("booking_branch_id_status_idx").on(t.branchId, t.status),
    check("booking_amount_chk", sql`estimated_total_satang >= 0 and deposit_required_satang >= 0 and deposit_verified_satang >= 0`),
  ],
);

/** บันทึกทุกการเปลี่ยนสถานะ (append-only) — ใช้ทำ analytics/OTA sync — US-13-02 */
export const bookingEvent = pgTable(
  "booking_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => booking.id, { onDelete: "cascade" }),
    /** booking | groom_appointment | stay | daycare_visit | deposit */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    reason: text("reason"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("booking_event_booking_id_created_at_idx").on(t.bookingId, t.createdAt),
    index("booking_event_organization_id_created_at_idx").on(t.organizationId, t.createdAt),
  ],
);

/** นัดกรูม 1 ตัว 1 ช่าง 1 โต๊ะ (กันชนด้วย exclusion constraint) — US-05-01, US-05-03, US-05-04, US-05-06 */
export const groomAppointment = pgTable(
  "groom_appointment",
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
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => booking.id, { onDelete: "cascade" }),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id),
    /** ระบบเลือกให้ถ้าลูกค้าเลือก any (R-04) */
    groomerId: uuid("groomer_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    groomerPreference: groomerPreferenceEnum("groomer_preference").notNull().default("any"),
    stationId: uuid("station_id")
      .notNull()
      .references((): AnyPgColumn => groomStation.id),
    /** UTC */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    /** = starts_at + Σduration */
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    /** = ends_at + buffer (ใช้ใน exclusion constraint) */
    blockedUntil: timestamp("blocked_until", { withTimezone: true, mode: "date" }).notNull(),
    status: groomStatusEnum("status").notNull().default("scheduled"),
    /** snapshot ตอนจอง */
    sizeTierId: uuid("size_tier_id").references((): AnyPgColumn => sizeTier.id, { onDelete: "set null" }),
    /** snapshot */
    coatGroup: coatGroupEnum("coat_group").notNull().default("any"),
    weightGramsAtBooking: integer("weight_grams_at_booking"),
    weightGramsCheckin: integer("weight_grams_checkin"),
    /** ticks_fleas | wound | matted | skin_issue */
    conditionFlags: text("condition_flags").array().notNull().default(sql`'{}'`),
    conditionNote: text("condition_note"),
    /** Σ groom_appointment_item */
    servicesTotalSatang: integer("services_total_satang").notNull().default(0),
    /** Σ appointment_surcharge */
    surchargeTotalSatang: integer("surcharge_total_satang").notNull().default(0),
    /** นัดที่เกิดจาก Stay + Groom bundle */
    fromStayId: uuid("from_stay_id").references((): AnyPgColumn => stay.id, { onDelete: "set null" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    doneAt: timestamp("done_at", { withTimezone: true, mode: "date" }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true, mode: "date" }),
    staffNote: text("staff_note"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("groom_appointment_branch_id_starts_at_idx").on(t.branchId, t.startsAt),
    index("groom_appointment_groomer_id_starts_at_idx").on(t.groomerId, t.startsAt),
    index("groom_appointment_pet_id_starts_at_idx").on(t.petId, t.startsAt),
    check("ga_time_chk", sql`ends_at > starts_at and blocked_until >= ends_at`),
  ],
);

/** บริการ/add-on ในนัด (ราคา snapshot) — US-05-04, US-11-03 */
export const groomAppointmentItem = pgTable(
  "groom_appointment_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references((): AnyPgColumn => groomAppointment.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references((): AnyPgColumn => service.id),
    isAddon: boolean("is_addon").notNull().default(false),
    nameSnapshot: text("name_snapshot").notNull(),
    priceSatang: integer("price_satang").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    /** ถ้าจะใช้สิทธิ์แพ็กเกจ */
    customerPackageId: uuid("customer_package_id").references((): AnyPgColumn => customerPackage.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("groom_appointment_item_appointment_id_idx").on(t.appointmentId)],
);

/** ค่าบริการเพิ่มหน้างาน — US-04-05 */
export const appointmentSurcharge = pgTable(
  "appointment_surcharge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references((): AnyPgColumn => groomAppointment.id, { onDelete: "cascade" }),
    surchargeTypeId: uuid("surcharge_type_id").references((): AnyPgColumn => surchargeType.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    amountSatang: integer("amount_satang").notNull(),
    /** บังคับกรอก */
    reason: text("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [check("surcharge_amt_chk", sql`amount_satang > 0`)],
);

/** ใบยินยอม/ข้อตกลงที่ลูกค้าเซ็น (immutable) — US-05-06, US-06-08 */
export const consentDocument = pgTable(
  "consent_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    kind: consentDocKindEnum("kind").notNull(),
    appointmentId: uuid("appointment_id").references((): AnyPgColumn => groomAppointment.id, { onDelete: "set null" }),
    stayId: uuid("stay_id").references((): AnyPgColumn => stay.id, { onDelete: "set null" }),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    /** matted_shave | senior | medical_condition | aggressive | other */
    reasons: text("reasons").array().notNull().default(sql`'{}'`),
    /** ข้อความที่ลูกค้าเห็นตอนเซ็น */
    bodySnapshot: text("body_snapshot").notNull(),
    /** วงเงินพาไปหาหมอ (ข้อตกลงรับฝาก) */
    emergencyVetLimitSatang: integer("emergency_vet_limit_satang"),
    signerName: text("signer_name").notNull(),
    /** PNG จาก canvas */
    signatureFileId: uuid("signature_file_id")
      .notNull()
      .references((): AnyPgColumn => fileObject.id),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [check("consent_target_chk", sql`(appointment_id is not null) <> (stay_id is not null)`)],
);

/** การพัก 1 ตัว 1 ช่วงวัน (กันห้องซ้อนด้วย exclusion constraint) — US-06-03, US-06-04, US-06-11, US-11-04 */
export const stay = pgTable(
  "stay",
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
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => booking.id, { onDelete: "cascade" }),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references((): AnyPgColumn => roomType.id),
    /** ระบบจัดห้องให้ตอนจอง (R-10) */
    roomUnitId: uuid("room_unit_id")
      .notNull()
      .references((): AnyPgColumn => roomUnit.id),
    /** วันท้องถิ่น */
    checkInDate: date("check_in_date", { mode: "string" }).notNull(),
    /** > check_in_date */
    checkOutDate: date("check_out_date", { mode: "string" }).notNull(),
    expectedCheckInTime: time("expected_check_in_time"),
    expectedCheckOutTime: time("expected_check_out_time"),
    /** = check_out_date - check_in_date */
    nights: integer("nights").notNull(),
    /** snapshot */
    nightlyPriceSatang: integer("nightly_price_satang").notNull(),
    /** = nights × nightly */
    roomTotalSatang: integer("room_total_satang").notNull(),
    status: stayStatusEnum("status").notNull().default("reserved"),
    /** ลูกค้า/ร้านแจ้ง */
    inHeat: boolean("in_heat").notNull().default(false),
    /** Stay + Groom */
    bundleAppointmentId: uuid("bundle_appointment_id").references((): AnyPgColumn => groomAppointment.id, { onDelete: "set null" }),
    weightGramsIn: integer("weight_grams_in"),
    weightGramsOut: integer("weight_grams_out"),
    /** ร้านข้าม vaccine gate (เข้า audit log) */
    vaccineOverrideReason: text("vaccine_override_reason"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true, mode: "date" }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("stay_branch_id_check_in_date_idx").on(t.branchId, t.checkInDate),
    index("stay_branch_id_check_out_date_idx").on(t.branchId, t.checkOutDate),
    check("stay_dates_chk", sql`check_out_date > check_in_date and nights = (check_out_date - check_in_date)`),
  ],
);

/** add-on ระหว่างพัก — US-06-06 */
export const stayAddon = pgTable(
  "stay_addon",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    stayId: uuid("stay_id")
      .notNull()
      .references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
    /** scope = hotel, is_addon */
    serviceId: uuid("service_id")
      .notNull()
      .references((): AnyPgColumn => service.id),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceSatang: integer("unit_price_satang").notNull(),
    /** per_day → = nights */
    quantity: integer("quantity").notNull().default(1),
    totalSatang: integer("total_satang").notNull(),
    addedByType: actorTypeEnum("added_by_type").notNull(),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [check("stay_addon_chk", sql`quantity > 0 and total_satang = unit_price_satang * quantity`)],
);

/** ฟอร์มรับฝาก (1:1 กับ stay) — US-06-08 */
export const stayIntake = pgTable("stay_intake", {
  stayId: uuid("stay_id")
    .primaryKey()
    .references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  foodBrand: text("food_brand"),
  /** เช่น 1 ถ้วย */
  foodAmount: text("food_amount"),
  /** สร้าง care_task feed ตามเวลานี้ */
  feedingTimes: time("feeding_times").array().notNull().default(sql`'{}'`),
  foodProvidedByOwner: boolean("food_provided_by_owner").notNull().default(true),
  /** สร้าง care_task walk */
  walksPerDay: integer("walks_per_day").notNull().default(0),
  /** สภาพร่างกายตอนรับ */
  conditionNote: text("condition_note"),
  /** file_object.id */
  conditionPhotoIds: uuid("condition_photo_ids").array().notNull().default(sql`'{}'`),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  vetClinicName: text("vet_clinic_name"),
  vetClinicPhone: text("vet_clinic_phone"),
  completedBy: uuid("completed_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
  /** ต้องมีค่าก่อนเปลี่ยน stay เป็น checked_in */
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** ยาที่ต้องให้ระหว่างพัก — US-06-08, US-06-09 */
export const stayMedication = pgTable("stay_medication", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  stayId: uuid("stay_id")
    .notNull()
    .references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  /** เวลาให้ยาแต่ละวัน (≥1) */
  times: time("times").array().notNull(),
  instructions: text("instructions"),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** ของที่ลูกค้านำมา — US-06-08, US-06-11 */
export const stayBelonging = pgTable("stay_belonging", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  stayId: uuid("stay_id")
    .notNull()
    .references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  quantity: integer("quantity").notNull().default(1),
  photoFileId: uuid("photo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
  /** ติ๊กตอน check-out */
  returnedAt: timestamp("returned_at", { withTimezone: true, mode: "date" }),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** งานดูแลรายวัน (สร้างอัตโนมัติตอนเช็คอิน R-26) — US-06-09 */
export const careTask = pgTable(
  "care_task",
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
    stayId: uuid("stay_id")
      .notNull()
      .references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
    taskType: careTaskTypeEnum("task_type").notNull(),
    title: text("title").notNull(),
    /** UTC */
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    medicationId: uuid("medication_id").references((): AnyPgColumn => stayMedication.id, { onDelete: "cascade" }),
    status: careTaskStatusEnum("status").notNull().default("pending"),
    doneAt: timestamp("done_at", { withTimezone: true, mode: "date" }),
    doneBy: uuid("done_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** เช่น กินหมด/เหลือครึ่ง */
    note: text("note"),
    photoFileId: uuid("photo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("care_task_branch_id_due_at_status_idx").on(t.branchId, t.dueAt, t.status),
    index("care_task_stay_id_due_at_idx").on(t.stayId, t.dueAt),
  ],
);

/** การฝาก Daycare 1 ตัว 1 วัน 1 รอบ — US-06-13, US-11-05 */
export const daycareVisit = pgTable(
  "daycare_visit",
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
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => booking.id, { onDelete: "cascade" }),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id),
    sessionTypeId: uuid("session_type_id")
      .notNull()
      .references((): AnyPgColumn => daycareSessionType.id),
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    /** snapshot */
    priceSatang: integer("price_satang").notNull(),
    status: daycareStatusEnum("status").notNull().default("reserved"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true, mode: "date" }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("daycare_visit_branch_id_visit_date_session_type_id_idx").on(t.branchId, t.visitDate, t.sessionTypeId),
    uniqueIndex("daycare_visit_pet_id_visit_date_session_type_id_uq")
      .on(t.petId, t.visitDate, t.sessionTypeId)
      .where(sql`status not in ('cancelled','no_show')`),
  ],
);
