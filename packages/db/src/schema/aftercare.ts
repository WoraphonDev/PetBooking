// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { groomAppointment, stay } from "./bookings";
import { customer, pet } from "./customers";
import {
  earConditionEnum,
  nailConditionEnum,
  parasiteFindingEnum,
  reportCardKindEnum,
  reportCardStatusEnum,
  skinConditionEnum,
  teethConditionEnum,
} from "./enums";
import { staffUser } from "./identity";
import { branch, organization } from "./platform";

/** Report card กรูม / Stay report — US-10-01, US-10-02, US-10-03 */
export const reportCard = pgTable(
  "report_card",
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
    kind: reportCardKindEnum("kind").notNull(),
    appointmentId: uuid("appointment_id").references((): AnyPgColumn => groomAppointment.id, { onDelete: "cascade" }),
    stayId: uuid("stay_id").references((): AnyPgColumn => stay.id, { onDelete: "cascade" }),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id),
    customerId: uuid("customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    /** grooming บังคับ */
    skin: skinConditionEnum("skin"),
    ears: earConditionEnum("ears"),
    nails: nailConditionEnum("nails"),
    teeth: teethConditionEnum("teeth"),
    parasites: parasiteFindingEnum("parasites"),
    /** 1–5 */
    cooperation: integer("cooperation"),
    /** ถึงลูกค้า */
    staffNote: text("staff_note"),
    recommendation: text("recommendation"),
    status: reportCardStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    /** 1–5 */
    customerRating: integer("customer_rating"),
    /** ส่วนตัวถึงร้าน */
    customerFeedback: text("customer_feedback"),
    ratedAt: timestamp("rated_at", { withTimezone: true, mode: "date" }),
    googleReviewClickedAt: timestamp("google_review_clicked_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("report_card_appointment_id_uq").on(t.appointmentId).where(sql`appointment_id is not null`),
    uniqueIndex("report_card_stay_id_uq").on(t.stayId).where(sql`stay_id is not null`),
    index("report_card_customer_id_idx").on(t.customerId),
    check("rc_target_chk", sql`(appointment_id is not null) <> (stay_id is not null)`),
    check(
      "rc_rating_chk",
      sql`(cooperation is null or cooperation between 1 and 5) and (customer_rating is null or customer_rating between 1 and 5)`,
    ),
  ],
);
