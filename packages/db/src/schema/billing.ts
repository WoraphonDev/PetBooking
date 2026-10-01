// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { booking } from "./bookings";
import { commissionRule, packageTemplate } from "./catalog";
import { customer, fileObject, pet } from "./customers";
import {
  actorTypeEnum,
  billLineTypeEnum,
  billStatusEnum,
  commissionStatusEnum,
  creditReasonEnum,
  customerPackageStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  refundModeEnum,
  slipStatusEnum,
} from "./enums";
import { staffUser } from "./identity";
import { branch, organization } from "./platform";

/** สลิปที่อัปโหลด (ร้านยืนยันเอง + จับซ้ำจาก QR บนสลิป R-05) — US-07-02, US-11-07 */
export const paymentSlip = pgTable(
  "payment_slip",
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
    bookingId: uuid("booking_id").references((): AnyPgColumn => booking.id, { onDelete: "set null" }),
    billId: uuid("bill_id").references((): AnyPgColumn => bill.id, { onDelete: "set null" }),
    fileId: uuid("file_id")
      .notNull()
      .references((): AnyPgColumn => fileObject.id),
    uploadedByType: actorTypeEnum("uploaded_by_type").notNull(),
    /** ยอดที่ระบบขอ */
    amountExpectedSatang: integer("amount_expected_satang").notNull(),
    /** ข้อความที่อ่านได้จาก QR บนสลิป */
    qrPayload: text("qr_payload"),
    /** เลขอ้างอิงที่แยกจาก qr_payload */
    transRef: text("trans_ref"),
    /** มีค่า = เคยมีสลิป trans_ref นี้แล้ว */
    duplicateOfSlipId: uuid("duplicate_of_slip_id"),
    status: slipStatusEnum("status").notNull().default("submitted"),
    reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    rejectReason: text("reject_reason"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("payment_slip_organization_id_trans_ref_idx").on(t.organizationId, t.transRef).where(sql`trans_ref is not null`),
    index("payment_slip_branch_id_status_idx").on(t.branchId, t.status),
  ],
);

/** เงินที่รับจริง (มัดจำและชำระบิล) — US-07-02, US-08-04 */
export const payment = pgTable(
  "payment",
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
    /** มัดจำ */
    bookingId: uuid("booking_id").references((): AnyPgColumn => booking.id, { onDelete: "set null" }),
    /** ชำระบิล */
    billId: uuid("bill_id").references((): AnyPgColumn => bill.id, { onDelete: "set null" }),
    /** deposit = โอนมัดจำมาใช้ในบิล, credit = ใช้เครดิต */
    method: paymentMethodEnum("method").notNull(),
    /** > 0 */
    amountSatang: integer("amount_satang").notNull(),
    /** เงินสดที่ลูกค้าให้ (คำนวณเงินทอน) */
    tenderedSatang: integer("tendered_satang"),
    slipId: uuid("slip_id").references((): AnyPgColumn => paymentSlip.id, { onDelete: "set null" }),
    proofFileId: uuid("proof_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    /** เช่น เลข EDC */
    reference: text("reference"),
    receivedBy: uuid("received_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    status: paymentStatusEnum("status").notNull().default("posted"),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
    voidedBy: uuid("voided_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_bill_id_idx").on(t.billId),
    index("payment_booking_id_idx").on(t.bookingId),
    index("payment_branch_id_received_at_idx").on(t.branchId, t.receivedAt),
    check("payment_amt_chk", sql`amount_satang > 0`),
    check("payment_target_chk", sql`booking_id is not null or bill_id is not null`),
  ],
);

/** การคืนเงิน/คืนเป็นเครดิต (ร้านโอนคืนเองแล้วบันทึก) — US-07-05 */
export const refund = pgTable(
  "refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    bookingId: uuid("booking_id").references((): AnyPgColumn => booking.id, { onDelete: "set null" }),
    billId: uuid("bill_id").references((): AnyPgColumn => bill.id, { onDelete: "set null" }),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    amountSatang: integer("amount_satang").notNull(),
    mode: refundModeEnum("mode").notNull(),
    reason: text("reason").notNull(),
    proofFileId: uuid("proof_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [check("refund_amt_chk", sql`amount_satang > 0`)],
);

/** สมุดเครดิตลูกค้า (append-only, ยอด = SUM) — US-07-05, US-08-03 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    /** + เพิ่ม / − ใช้ */
    deltaSatang: integer("delta_satang").notNull(),
    reason: creditReasonEnum("reason").notNull(),
    /** booking | bill | refund */
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdBy: uuid("created_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_ledger_customer_id_created_at_idx").on(t.customerId, t.createdAt),
    check("credit_delta_chk", sql`delta_satang <> 0`),
  ],
);

/** บิล/ใบเสร็จ — US-08-01..06 */
export const bill = pgTable(
  "bill",
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
    /** null = ลูกค้าทั่วไป (ขาย quick item) */
    customerId: uuid("customer_id").references((): AnyPgColumn => customer.id),
    /** ออกตอนปิดบิล R-16; unique ต่อสาขา */
    receiptNo: text("receipt_no"),
    status: billStatusEnum("status").notNull().default("open"),
    /** Σ line_total */
    subtotalSatang: integer("subtotal_satang").notNull().default(0),
    billDiscountSatang: integer("bill_discount_satang").notNull().default(0),
    /** บังคับเมื่อ > 0 */
    billDiscountReason: text("bill_discount_reason"),
    /** = subtotal − bill_discount */
    totalSatang: integer("total_satang").notNull().default(0),
    /** Σ payment posted */
    paidSatang: integer("paid_satang").notNull().default(0),
    /** เงินทอน */
    changeSatang: integer("change_satang").notNull().default(0),
    openedBy: uuid("opened_by")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    closedBy: uuid("closed_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    voidedBy: uuid("voided_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
    voidReason: text("void_reason"),
    note: text("note"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("bill_branch_id_receipt_no_uq").on(t.branchId, t.receiptNo).where(sql`receipt_no is not null`),
    index("bill_branch_id_closed_at_idx").on(t.branchId, t.closedAt),
    index("bill_customer_id_idx").on(t.customerId),
    check("bill_total_chk", sql`total_satang = subtotal_satang - bill_discount_satang and total_satang >= 0`),
    check("bill_paid_chk", sql`status <> 'paid' or paid_satang = total_satang`),
  ],
);

/** รายการในบิล — US-08-01, US-08-03, US-10-05 */
export const billLine = pgTable(
  "bill_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    billId: uuid("bill_id")
      .notNull()
      .references((): AnyPgColumn => bill.id, { onDelete: "cascade" }),
    lineType: billLineTypeEnum("line_type").notNull(),
    /** groom_appointment_item | appointment_surcharge | stay | stay_addon | daycare_visit | package_template | customer_package */
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    /** ข้อความบนใบเสร็จ */
    description: text("description").notNull(),
    petId: uuid("pet_id").references((): AnyPgColumn => pet.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
    /** package_redemption = 0 */
    unitPriceSatang: integer("unit_price_satang").notNull(),
    lineDiscountSatang: integer("line_discount_satang").notNull().default(0),
    lineDiscountReason: text("line_discount_reason"),
    /** = qty × unit − discount */
    lineTotalSatang: integer("line_total_satang").notNull(),
    /** ช่างที่ทำ (ค่ามือ) */
    performerId: uuid("performer_id").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** R-13 */
    commissionBaseSatang: integer("commission_base_satang").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("bill_line_bill_id_idx").on(t.billId),
    check(
      "bill_line_total_chk",
      sql`line_total_satang = quantity * unit_price_satang - line_discount_satang and line_total_satang >= 0 and quantity > 0`,
    ),
  ],
);

/** แพ็กเกจที่ลูกค้าซื้อแล้ว — US-10-05, US-10-06 */
export const customerPackage = pgTable(
  "customer_package",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    templateId: uuid("template_id")
      .notNull()
      .references((): AnyPgColumn => packageTemplate.id),
    /** single_pet ต้องมีค่า */
    petId: uuid("pet_id").references((): AnyPgColumn => pet.id, { onDelete: "set null" }),
    sessionsTotal: integer("sessions_total").notNull(),
    sessionsUsed: integer("sessions_used").notNull().default(0),
    /** R-14 = floor(price/sessions) */
    unitValueSatang: integer("unit_value_satang").notNull(),
    purchasedBillId: uuid("purchased_bill_id")
      .notNull()
      .references((): AnyPgColumn => bill.id),
    purchasedAt: timestamp("purchased_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    status: customerPackageStatusEnum("status").notNull().default("active"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("customer_package_customer_id_status_idx").on(t.customerId, t.status),
    check("cpkg_chk", sql`sessions_used >= 0 and sessions_used <= sessions_total`),
  ],
);

/** การใช้สิทธิ์แพ็กเกจ — US-10-05, US-08-06 */
export const packageRedemption = pgTable("package_redemption", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  customerPackageId: uuid("customer_package_id")
    .notNull()
    .references((): AnyPgColumn => customerPackage.id),
  billLineId: uuid("bill_line_id")
    .notNull()
    .references((): AnyPgColumn => billLine.id),
  petId: uuid("pet_id")
    .notNull()
    .references((): AnyPgColumn => pet.id),
  performerId: uuid("performer_id").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** void บิล → คืนสิทธิ์ */
  reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** ค่ามือที่เกิดขึ้น (สร้างตอนปิดบิล) — US-09-02, US-09-05, US-12-03 */
export const commissionEntry = pgTable(
  "commission_entry",
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
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    billId: uuid("bill_id")
      .notNull()
      .references((): AnyPgColumn => bill.id),
    billLineId: uuid("bill_line_id")
      .notNull()
      .references((): AnyPgColumn => billLine.id),
    baseSatang: integer("base_satang").notNull(),
    /** กติกาที่ใช้ */
    ruleId: uuid("rule_id").references((): AnyPgColumn => commissionRule.id, { onDelete: "set null" }),
    /** R-13 */
    amountSatang: integer("amount_satang").notNull(),
    status: commissionStatusEnum("status").notNull().default("earned"),
    /** = bill.closed_at */
    earnedAt: timestamp("earned_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("commission_entry_staff_user_id_earned_at_idx").on(t.staffUserId, t.earnedAt),
    uniqueIndex("commission_entry_bill_line_id_uq").on(t.billLineId),
  ],
);
