// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
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
  coatGroupEnum,
  commissionTypeEnum,
  daycareSessionEnum,
  housekeepingStatusEnum,
  packageShareScopeEnum,
  rateChannelEnum,
  recordStatusEnum,
  roomUnitStatusEnum,
  serviceCategoryEnum,
  serviceScopeEnum,
  speciesEnum,
} from "./enums";
import { staffUser } from "./identity";
import { branch, organization } from "./platform";

/** ช่วงขนาดตามน้ำหนัก แยกหมา/แมว (ไม่ทับซ้อน) — US-04-02 */
export const sizeTier = pgTable(
  "size_tier",
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
    /** dog หรือ cat */
    species: speciesEnum("species").notNull(),
    /** XS S M L XL XXL */
    code: text("code").notNull(),
    /** เช่น 'เล็ก (≤5 กก.)' */
    labelTh: text("label_th").notNull(),
    /** inclusive */
    minWeightGrams: integer("min_weight_grams").notNull(),
    /** exclusive; null = ไม่มีเพดาน */
    maxWeightGrams: integer("max_weight_grams"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("size_tier_branch_id_species_code_uq").on(t.branchId, t.species, t.code),
    check("size_tier_range_chk", sql`min_weight_grams >= 0 and (max_weight_grams is null or max_weight_grams > min_weight_grams)`),
    check("size_tier_species_chk", sql`species in ('dog','cat')`),
  ],
);

/** แผนราคา (MVP ใช้ 'standard' แผนเดียว; P3 เพิ่มราคา OTA) — US-13-02 */
export const ratePlan = pgTable(
  "rate_plan",
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
    code: text("code").notNull().default("standard"),
    name: text("name").notNull(),
    channel: rateChannelEnum("channel").notNull().default("all"),
    /** 1 สาขามี default 1 แผน */
    isDefault: boolean("is_default").notNull().default(true),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("rate_plan_branch_id_code_uq").on(t.branchId, t.code),
    uniqueIndex("rate_plan_branch_id_uq").on(t.branchId).where(sql`is_default`),
  ],
);

/** บริการและ add-on ทุกโมดูล — US-04-01, US-04-04, US-06-06 */
export const service = pgTable(
  "service",
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
    scope: serviceScopeEnum("scope").notNull().default("grooming"),
    category: serviceCategoryEnum("category").notNull(),
    nameTh: text("name_th").notNull(),
    description: text("description"),
    photoFileId: uuid("photo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    /** ว่าง = ทุกชนิด */
    speciesAllowed: speciesEnum("species_allowed").array().notNull().default(sql`'{}'`),
    isAddon: boolean("is_addon").notNull().default(false),
    /** add-on โรงแรมคิดต่อวัน */
    addonPerDay: boolean("addon_per_day").notNull().default(false),
    /** ลูกค้าเห็นใน LIFF */
    onlineBookable: boolean("online_bookable").notNull().default(true),
    /** ต้นทุนโดยประมาณ (รายงานกำไรใน P2) */
    estCostSatang: integer("est_cost_satang"),
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
  (t) => [index("service_branch_id_scope_status_idx").on(t.branchId, t.scope, t.status)],
);

/** ราคาและเวลา = บริการ × ขนาด × กลุ่มขน (R-01..R-03) — US-04-02, US-04-03 */
export const servicePrice = pgTable(
  "service_price",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    serviceId: uuid("service_id")
      .notNull()
      .references((): AnyPgColumn => service.id, { onDelete: "cascade" }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references((): AnyPgColumn => ratePlan.id),
    /** null = ราคาเดียวทุกขนาด (เช่น add-on) */
    sizeTierId: uuid("size_tier_id").references((): AnyPgColumn => sizeTier.id, { onDelete: "cascade" }),
    coatGroup: coatGroupEnum("coat_group").notNull().default("any"),
    priceSatang: integer("price_satang").notNull(),
    /** add-on อาจเป็น 0 */
    durationMinutes: integer("duration_minutes").notNull().default(0),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("service_price_service_id_rate_plan_id_size_tier_id_coat__91868e").on(t.serviceId, t.ratePlanId, t.sizeTierId, t.coatGroup),
    check("service_price_chk", sql`price_satang >= 0 and duration_minutes >= 0 and duration_minutes <= 600`),
  ],
);

/** add-on ใช้กับบริการหลักไหนได้ (ไม่มีแถว = ใช้ได้ทุกบริการใน scope เดียวกัน) — US-04-04 */
export const serviceAddonLink = pgTable(
  "service_addon_link",
  {
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    addonServiceId: uuid("addon_service_id")
      .notNull()
      .references((): AnyPgColumn => service.id, { onDelete: "cascade" }),
    baseServiceId: uuid("base_service_id")
      .notNull()
      .references((): AnyPgColumn => service.id, { onDelete: "cascade" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.addonServiceId, t.baseServiceId] })],
);

/** ค่าบริการเพิ่มหน้างานที่ตั้งไว้ — US-04-05 */
export const surchargeType = pgTable("surcharge_type", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  /** สาขา */
  branchId: uuid("branch_id")
    .notNull()
    .references((): AnyPgColumn => branch.id),
  /** เช่น ขนพันกัน */
  nameTh: text("name_th").notNull(),
  defaultAmountSatang: integer("default_amount_satang").notNull().default(0),
  status: recordStatusEnum("status").notNull().default("active"),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** ประเภทห้องพัก — US-06-01 */
export const roomType = pgTable("room_type", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
  organizationId: uuid("organization_id")
    .notNull()
    .references((): AnyPgColumn => organization.id),
  /** สาขา */
  branchId: uuid("branch_id")
    .notNull()
    .references((): AnyPgColumn => branch.id),
  nameTh: text("name_th").notNull(),
  description: text("description"),
  photoFileId: uuid("photo_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
  /** ว่าง = ทุกชนิด */
  speciesAllowed: speciesEnum("species_allowed").array().notNull().default(sql`'{}'`),
  maxWeightGrams: integer("max_weight_grams"),
  minAgeMonths: integer("min_age_months"),
  /** รับตัวเมียติดสัด */
  allowInHeat: boolean("allow_in_heat").notNull().default(false),
  /** รับน้องที่มีป้าย bites/dog_reactive/cat_reactive */
  allowReactive: boolean("allow_reactive").notNull().default(false),
  /** เช่น aircon, camera, private */
  amenities: text("amenities").array().notNull().default(sql`'{}'`),
  /** สิ่งที่รวมในราคา */
  includedText: text("included_text"),
  onlineBookable: boolean("online_bookable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  status: recordStatusEnum("status").notNull().default("active"),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** ห้องรายยูนิต — US-06-01, US-06-04 */
export const roomUnit = pgTable(
  "room_unit",
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
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references((): AnyPgColumn => roomType.id),
    /** เช่น A1 */
    code: text("code").notNull(),
    zone: text("zone"),
    status: roomUnitStatusEnum("status").notNull().default("active"),
    /** check-out → dirty */
    housekeeping: housekeepingStatusEnum("housekeeping").notNull().default("clean"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("room_unit_branch_id_code_uq").on(t.branchId, t.code)],
);

/** ราคาห้องต่อคืน (null size_tier = ทุกขนาด) — US-06-02 */
export const roomRate = pgTable(
  "room_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references((): AnyPgColumn => roomType.id, { onDelete: "cascade" }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references((): AnyPgColumn => ratePlan.id),
    sizeTierId: uuid("size_tier_id").references((): AnyPgColumn => sizeTier.id, { onDelete: "cascade" }),
    nightlyPriceSatang: integer("nightly_price_satang").notNull(),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("room_rate_room_type_id_rate_plan_id_size_tier_id_uq").on(t.roomTypeId, t.ratePlanId, t.sizeTierId),
    check("room_rate_chk", sql`nightly_price_satang >= 0`),
  ],
);

/** รอบ Daycare — US-06-13 */
export const daycareSessionType = pgTable(
  "daycare_session_type",
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
    session: daycareSessionEnum("session").notNull(),
    nameTh: text("name_th").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    /** จำนวนตัวสูงสุดต่อวันต่อรอบ */
    capacity: integer("capacity").notNull(),
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
    uniqueIndex("daycare_session_type_branch_id_session_uq").on(t.branchId, t.session),
    check("dst_cap_chk", sql`capacity > 0`),
    check("dst_range_chk", sql`ends_at > starts_at`),
  ],
);

/** ราคา Daycare ต่อรอบ — US-06-13 */
export const daycareRate = pgTable(
  "daycare_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    sessionTypeId: uuid("session_type_id")
      .notNull()
      .references((): AnyPgColumn => daycareSessionType.id, { onDelete: "cascade" }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references((): AnyPgColumn => ratePlan.id),
    sizeTierId: uuid("size_tier_id").references((): AnyPgColumn => sizeTier.id, { onDelete: "cascade" }),
    priceSatang: integer("price_satang").notNull(),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("daycare_rate_session_type_id_rate_plan_id_size_tier_id_uq").on(t.sessionTypeId, t.ratePlanId, t.sizeTierId)],
);

/** แพ็กเกจหลายครั้งที่ร้านขาย — US-10-05 */
export const packageTemplate = pgTable(
  "package_template",
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
    nameTh: text("name_th").notNull(),
    /** บริการที่ใช้สิทธิ์ได้ */
    serviceId: uuid("service_id")
      .notNull()
      .references((): AnyPgColumn => service.id),
    /** null = ทุกขนาด */
    sizeTierId: uuid("size_tier_id").references((): AnyPgColumn => sizeTier.id, { onDelete: "set null" }),
    /** ≥ 2 */
    sessionsCount: integer("sessions_count").notNull(),
    priceSatang: integer("price_satang").notNull(),
    validityDays: integer("validity_days").notNull().default(365),
    shareScope: packageShareScopeEnum("share_scope").notNull().default("single_pet"),
    status: recordStatusEnum("status").notNull().default("active"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("pkg_tpl_chk", sql`sessions_count >= 2 and price_satang > 0 and validity_days > 0`)],
);

/** กติกาค่ามือ (ลำดับความสำคัญใน R-13) — US-09-02 */
export const commissionRule = pgTable(
  "commission_rule",
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
    /** null = ทุกบริการ */
    serviceId: uuid("service_id").references((): AnyPgColumn => service.id, { onDelete: "cascade" }),
    /** null = ทุกช่าง */
    staffUserId: uuid("staff_user_id").references((): AnyPgColumn => staffUser.id, { onDelete: "cascade" }),
    type: commissionTypeEnum("type").notNull(),
    /** percent = basis points (1500 = 15%), fixed = satang */
    value: integer("value").notNull(),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("commission_rule_branch_id_service_id_staff_user_id_uq").on(t.branchId, t.serviceId, t.staffUserId),
    check("commission_value_chk", sql`value >= 0 and (type <> 'percent' or value <= 10000)`),
  ],
);
