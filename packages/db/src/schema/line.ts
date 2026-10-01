// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { type AnyPgColumn, boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ownerProfile } from "./customers";
import { lineChannelStatusEnum } from "./enums";
import { branch, organization } from "./platform";

/** การเชื่อม LINE OA ของสาขา (ทีมแพลตฟอร์มกรอก — ตามผล SP-01) — US-02-06, US-13-06 */
export const lineChannel = pgTable(
  "line_channel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    /** 1 สาขา : 1 OA */
    branchId: uuid("branch_id")
      .notNull()
      .references((): AnyPgColumn => branch.id, { onDelete: "cascade" }),
    /** LINE provider ที่ OA สังกัด (userId แยกตาม provider) */
    providerId: text("provider_id").notNull(),
    messagingChannelId: text("messaging_channel_id").notNull(),
    /** เข้ารหัส AES-256-GCM ด้วย APP_ENCRYPTION_KEY */
    channelSecretEnc: text("channel_secret_enc").notNull(),
    /** long-lived token เข้ารหัส */
    channelAccessTokenEnc: text("channel_access_token_enc").notNull(),
    /** LINE Login channel ที่มี LIFF (provider เดียวกับ OA) */
    loginChannelId: text("login_channel_id").notNull(),
    liffId: text("liff_id").notNull(),
    /** @xxxx ใช้สร้างลิงก์เพิ่มเพื่อน */
    botBasicId: text("bot_basic_id"),
    /** โควตา push ของแพ็ก OA ที่ร้านใช้ (R-18) */
    monthlyPushQuota: integer("monthly_push_quota").notNull().default(300),
    richMenuId: text("rich_menu_id"),
    webhookVerifiedAt: timestamp("webhook_verified_at", { withTimezone: true, mode: "date" }),
    status: lineChannelStatusEnum("status").notNull().default("pending"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("line_channel_branch_id_uq").on(t.branchId),
    uniqueIndex("line_channel_messaging_channel_id_uq").on(t.messagingChannelId),
  ],
);

/** บัญชี LINE ของลูกค้า (unique ต่อ provider) — US-01-01 */
export const lineIdentity = pgTable(
  "line_identity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id").notNull(),
    /** จาก ID token ที่ verify แล้วเท่านั้น */
    lineUserId: text("line_user_id").notNull(),
    ownerProfileId: uuid("owner_profile_id")
      .notNull()
      .references((): AnyPgColumn => ownerProfile.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    pictureUrl: text("picture_url"),
    /** อัปเดตจาก follow/unfollow webhook */
    isFriend: boolean("is_friend").notNull().default(false),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("line_identity_provider_id_line_user_id_uq").on(t.providerId, t.lineUserId),
    index("line_identity_owner_profile_id_idx").on(t.ownerProfileId),
  ],
);
