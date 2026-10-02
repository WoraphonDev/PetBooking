// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { fileObject } from "./customers";
import { adminStatusEnum, sessionSubjectEnum, staffRoleEnum, staffStatusEnum } from "./enums";
import { branch, organization } from "./platform";

/** ทีมแพลตฟอร์ม — US-13-10, US-13-11 */
export const platformAdmin = pgTable(
  "platform_admin",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** lowercase */
    email: text("email").notNull(),
    /** argon2id */
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    status: adminStatusEnum("status").notNull().default("active"),
    /** R-24 (Q-0016) */
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    /** R-24 (Q-0016) */
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("platform_admin_email_uq").on(t.email)],
);

/** ผู้ใช้ฝั่งร้าน (เจ้าของ/หน้าร้าน/ช่าง) — US-01-02, US-01-03, US-01-04 */
export const staffUser = pgTable(
  "staff_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    /** lowercase, unique ทั้งระบบ (null ได้ถ้าใช้ LINE อย่างเดียว) */
    email: text("email"),
    /** argon2id; null ถ้ายังไม่ตั้งรหัส */
    passwordHash: text("password_hash"),
    /** ชื่อเล่นที่ลูกค้าเห็น */
    displayName: text("display_name").notNull(),
    /** E.164 */
    phone: text("phone"),
    /** owner / front_desk / staff — ดู permission matrix */
    role: staffRoleEnum("role").notNull(),
    /** แสดงในตัวเลือกช่างและ slot engine */
    isGroomer: boolean("is_groomer").notNull().default(false),
    /** LINE userId จาก LINE Login ของแพลตฟอร์ม (provider ของแพลตฟอร์ม) */
    lineUserId: text("line_user_id"),
    photoFileId: uuid("photo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    status: staffStatusEnum("status").notNull().default("invited"),
    /** R-24 */
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    /** R-24 */
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("staff_user_email_uq").on(t.email).where(sql`email is not null`),
    uniqueIndex("staff_user_line_user_id_uq").on(t.lineUserId).where(sql`line_user_id is not null`),
    index("staff_user_organization_id_idx").on(t.organizationId),
  ],
);

/** คำเชิญพนักงาน — US-01-04 */
export const staffInvite = pgTable(
  "staff_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    /** record ที่สร้างไว้สถานะ invited */
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    /** sha256 ของ token ในลิงก์ */
    tokenHash: text("token_hash").notNull(),
    /** สร้าง + 7 วัน */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references((): AnyPgColumn => staffUser.id),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_invite_token_hash_uq").on(t.tokenHash)],
);

/** ลิงก์รีเซ็ตรหัสผ่าน — US-01-02 */
export const passwordReset = pgTable(
  "password_reset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    /** sha256 */
    tokenHash: text("token_hash").notNull(),
    /** สร้าง + 30 นาที */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    /** ใช้ได้ครั้งเดียว */
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_token_hash_uq").on(t.tokenHash)],
);

/** session ของทุกประเภทผู้ใช้ (cookie httpOnly เก็บ token, DB เก็บ hash) — US-01-01, US-01-02 */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 ของ session token */
    tokenHash: text("token_hash").notNull(),
    subjectType: sessionSubjectEnum("subject_type").notNull(),
    /** staff_user.id / owner_profile.id / platform_admin.id */
    subjectId: uuid("subject_id").notNull(),
    /** staff: org ของตัวเอง, customer: org ของร้านที่เปิด LIFF */
    organizationId: uuid("organization_id").references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    /** customer session ผูกสาขาที่เปิด LIFF */
    branchId: uuid("branch_id").references((): AnyPgColumn => branch.id, { onDelete: "cascade" }),
    /** staff 30 วัน (sliding), customer 30 วัน, admin 12 ชม. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    /** มีค่า = session ของ support mode (อ่านอย่างเดียว) */
    supportAccessLogId: uuid("support_access_log_id"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("session_token_hash_uq").on(t.tokenHash),
    index("session_subject_type_subject_id_idx").on(t.subjectType, t.subjectId),
  ],
);

/** อุปกรณ์ที่รับ Web Push — US-13-05, US-09-04 */
export const webPushSubscription = pgTable(
  "web_push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    /** unique */
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
    /** ตั้งเมื่อ push ได้ 404/410 */
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("web_push_subscription_endpoint_uq").on(t.endpoint),
    index("web_push_subscription_staff_user_id_idx").on(t.staffUserId),
  ],
);

/** เวลาทำงานรายสัปดาห์ของช่าง — US-09-01 */
export const staffWorkingHours = pgTable(
  "staff_working_hours",
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
      .references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    /** 0–6 */
    weekday: integer("weekday").notNull(),
    /** เวลาท้องถิ่น */
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    /** ช่วงพัก (ถ้ามี) */
    breakStartsAt: time("break_starts_at"),
    breakEndsAt: time("break_ends_at"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("staff_working_hours_staff_user_id_branch_id_weekday_uq").on(t.staffUserId, t.branchId, t.weekday),
    check("swh_weekday_chk", sql`weekday between 0 and 6`),
    check("swh_range_chk", sql`ends_at > starts_at`),
    check(
      "swh_break_chk",
      sql`(break_starts_at is null and break_ends_at is null) or (break_ends_at > break_starts_at and break_starts_at >= starts_at and break_ends_at <= ends_at)`,
    ),
  ],
);

/** วันหยุด/ลาของช่าง — US-09-01 */
export const staffTimeOff = pgTable(
  "staff_time_off",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    /** UTC */
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    /** UTC exclusive */
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
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
    index("staff_time_off_staff_user_id_starts_at_idx").on(t.staffUserId, t.startsAt),
    check("sto_range_chk", sql`ends_at > starts_at`),
  ],
);
