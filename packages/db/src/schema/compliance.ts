// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { fileObject, ownerProfile } from "./customers";
import {
  actorTypeEnum,
  consentSubjectEnum,
  dataRequestStatusEnum,
  dataRequestTypeEnum,
  feedbackStatusEnum,
  importKindEnum,
  importStatusEnum,
  legalDocEnum,
} from "./enums";
import { platformAdmin, staffUser } from "./identity";
import { organization } from "./platform";

/** บันทึกการกระทำสำคัญ (append-only, trigger ห้าม update/delete) — US-13-07 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    /** ดูรายการ action ใน 04-business-rules R-27 */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    /** ทำผ่าน support mode */
    supportAccessLogId: uuid("support_access_log_id"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_organization_id_created_at_idx").on(t.organizationId, t.createdAt),
    index("audit_log_entity_type_entity_id_idx").on(t.entityType, t.entityId),
  ],
);

/** การยอมรับเอกสารกฎหมาย (PDPA) — US-13-08, US-11-01, US-03-12 */
export const consentRecord = pgTable(
  "consent_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: consentSubjectEnum("subject_type").notNull(),
    /** owner_profile.id หรือ organization.id */
    subjectId: uuid("subject_id").notNull(),
    /** ร้านที่เกี่ยวข้อง */
    organizationId: uuid("organization_id").references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    document: legalDocEnum("document").notNull(),
    /** เช่น 2026-10-01 */
    version: text("version").notNull(),
    /** photo_consent อาจเป็น false */
    accepted: boolean("accepted").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("consent_record_subject_type_subject_id_document_idx").on(t.subjectType, t.subjectId, t.document)],
);

/** คำขอดู/ลบข้อมูลส่วนบุคคล — US-13-08, US-11-01 */
export const dataRequest = pgTable("data_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  ownerProfileId: uuid("owner_profile_id")
    .notNull()
    .references((): AnyPgColumn => ownerProfile.id),
  type: dataRequestTypeEnum("type").notNull(),
  status: dataRequestStatusEnum("status").notNull().default("open"),
  /** platform_admin.id */
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  note: text("note"),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** แจ้งปัญหา/ขอ feature จากร้าน — US-13-13 */
export const feedbackReport = pgTable("feedback_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  staffUserId: uuid("staff_user_id")
    .notNull()
    .references((): AnyPgColumn => staffUser.id),
  pageUrl: text("page_url").notNull(),
  message: text("message").notNull(),
  screenshotFileId: uuid("screenshot_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
  /** git sha */
  appVersion: text("app_version"),
  status: feedbackStatusEnum("status").notNull().default("new"),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** การเข้าโหมดช่วยเหลือของทีมแพลตฟอร์ม — US-13-11 */
export const supportAccessLog = pgTable("support_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  platformAdminId: uuid("platform_admin_id")
    .notNull()
    .references((): AnyPgColumn => platformAdmin.id),
  reason: text("reason").notNull(),
  /** เช่น feedback_report.id */
  ticketRef: text("ticket_ref"),
  readOnly: boolean("read_only").notNull().default(true),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** งานนำเข้า CSV (validate ก่อน commit) — US-02-08 */
export const importJob = pgTable("import_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  kind: importKindEnum("kind").notNull(),
  fileId: uuid("file_id")
    .notNull()
    .references((): AnyPgColumn => fileObject.id),
  status: importStatusEnum("status").notNull().default("validating"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  /** [{row, column, code, message}] */
  errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid("created_by")
    .notNull()
    .references((): AnyPgColumn => staffUser.id),
  committedAt: timestamp("committed_at", { withTimezone: true, mode: "date" }),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
