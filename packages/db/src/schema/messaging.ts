// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { type AnyPgColumn, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  jobStatusEnum,
  jobTypeEnum,
  notificationChannelEnum,
  notificationSkipReasonEnum,
  notificationStatusEnum,
  recipientTypeEnum,
} from "./enums";
import { branch, organization } from "./platform";

/** ทุกข้อความที่ส่ง/ข้าม (ใช้นับโควตา LINE ด้วย R-18) — US-13-05, US-13-06 */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references((): AnyPgColumn => branch.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    recipientType: recipientTypeEnum("recipient_type").notNull(),
    /** customer.id หรือ staff_user.id */
    recipientId: uuid("recipient_id").notNull(),
    /** ดู notification catalog ใน 05 */
    templateKey: text("template_key").notNull(),
    /** ตัวแปรของ template */
    payload: jsonb("payload").notNull(),
    /** unique — กันส่งซ้ำ */
    dedupeKey: text("dedupe_key").notNull(),
    /** YYYY-MM ตามเวลาท้องถิ่น (นับโควตา) */
    monthKey: text("month_key").notNull(),
    status: notificationStatusEnum("status").notNull().default("queued"),
    skipReason: notificationSkipReasonEnum("skip_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    error: text("error"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_dedupe_key_uq").on(t.dedupeKey),
    index("notification_branch_id_month_key_channel_status_idx").on(t.branchId, t.monthKey, t.channel, t.status),
  ],
);

/** งานตั้งเวลา (ประมวลผลโดย /api/cron/tick ทุก 1–5 นาที) — US-05-02, US-07-06, US-10-04, US-12-05 */
export const scheduledJob = pgTable(
  "scheduled_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    jobType: jobTypeEnum("job_type").notNull(),
    runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull(),
    payload: jsonb("payload").notNull(),
    /** unique — เช่น reminder_24h:{appointmentId} */
    dedupeKey: text("dedupe_key").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    /** สูงสุด 5 แล้ว failed */
    attempts: integer("attempts").notNull().default(0),
    /** ใช้ SELECT … FOR UPDATE SKIP LOCKED */
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("scheduled_job_dedupe_key_uq").on(t.dedupeKey), index("scheduled_job_status_run_at_idx").on(t.status, t.runAt)],
);
