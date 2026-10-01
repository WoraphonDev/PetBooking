// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —
// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).

import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { groomAppointment, stay } from "./bookings";
import {
  actorTypeEnum,
  bookingChannelEnum,
  coatTypeEnum,
  fileKindEnum,
  linkRequestStatusEnum,
  petSexEnum,
  petStatusEnum,
  photoConsentEnum,
  photoKindEnum,
  recordSourceEnum,
  recordStatusEnum,
  speciesEnum,
  temperamentFlagEnum,
  vaccineStatusEnum,
} from "./enums";
import { staffUser } from "./identity";
import { lineIdentity } from "./line";
import { organization } from "./platform";

/** ตัวตนเจ้าของสัตว์ระดับแพลตฟอร์ม (MVP: สร้างแยกต่อร้าน, P3 จึงรวมข้ามร้าน) — US-13-02, US-03-01 */
export const ownerProfile = pgTable(
  "owner_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ร้านที่สร้าง record นี้ */
    createdInOrgId: uuid("created_in_org_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    nickname: text("nickname"),
    /** R-22 normalize */
    phoneE164: text("phone_e164"),
    email: text("email"),
    birthDate: date("birth_date", { mode: "string" }),
    addressLine: text("address_line"),
    subdistrict: text("subdistrict"),
    district: text("district"),
    province: text("province"),
    postalCode: text("postal_code"),
    /** PDPA ลบข้อมูล: ล้างค่าส่วนตัวแล้วตั้งเวลา */
    erasedAt: timestamp("erased_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("owner_profile_created_in_org_id_phone_e164_idx").on(t.createdInOrgId, t.phoneE164)],
);

/** ความสัมพันธ์ลูกค้า-ร้าน + ข้อมูลเฉพาะร้าน — US-03-01, US-03-09, US-03-12, US-11-01 */
export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    ownerProfileId: uuid("owner_profile_id")
      .notNull()
      .references((): AnyPgColumn => ownerProfile.id),
    /** ช่องทางที่รู้จักร้านครั้งแรก */
    sourceChannel: bookingChannelEnum("source_channel").notNull().default("walk_in"),
    /** รู้จักร้านจากไหน (ข้อความ) */
    referralNote: text("referral_note"),
    emergencyContactName: text("emergency_contact_name"),
    /** E.164 */
    emergencyContactPhone: text("emergency_contact_phone"),
    /** ลูกค้าไม่เห็น */
    internalNote: text("internal_note"),
    /** 1–4 คำนวณโดย R-09 */
    reliabilityLevel: integer("reliability_level").notNull().default(3),
    /** ร้านกำหนดเอง 1–4 (ชนะค่าคำนวณ) */
    reliabilityOverride: integer("reliability_override"),
    /** cache สำหรับ R-09 */
    lateCancelCount12m: integer("late_cancel_count_12m").notNull().default(0),
    /** cache สำหรับ R-09 */
    noShowCount12m: integer("no_show_count_12m").notNull().default(0),
    /** true = จองออนไลน์ไม่ได้ */
    blacklisted: boolean("blacklisted").notNull().default(false),
    blacklistReason: text("blacklist_reason"),
    /** ยกเว้นมัดจำ */
    depositExempt: boolean("deposit_exempt").notNull().default(false),
    photoConsent: photoConsentEnum("photo_consent").notNull().default("unknown"),
    photoConsentAt: timestamp("photo_consent_at", { withTimezone: true, mode: "date" }),
    /** นับเมื่อบิลจ่ายแล้ว */
    visitCount: integer("visit_count").notNull().default(0),
    firstVisitAt: timestamp("first_visit_at", { withTimezone: true, mode: "date" }),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true, mode: "date" }),
    /** cache = SUM(credit_ledger) — อัปเดตใน transaction เดียวกัน */
    creditBalanceSatang: integer("credit_balance_satang").notNull().default(0),
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
    uniqueIndex("customer_organization_id_owner_profile_id_uq").on(t.organizationId, t.ownerProfileId),
    index("customer_organization_id_last_visit_at_idx").on(t.organizationId, t.lastVisitAt),
    check(
      "customer_rel_chk",
      sql`reliability_level between 1 and 4 and (reliability_override is null or reliability_override between 1 and 4)`,
    ),
    check("customer_credit_chk", sql`credit_balance_satang >= 0`),
  ],
);

/** คำขอจับคู่บัญชี LINE กับลูกค้าเดิมของร้าน (ไม่มี OTP จึงให้ร้านยืนยัน) — US-01-01, US-11-01 */
export const customerLinkRequest = pgTable(
  "customer_link_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    lineIdentityId: uuid("line_identity_id")
      .notNull()
      .references((): AnyPgColumn => lineIdentity.id, { onDelete: "cascade" }),
    /** profile ที่สร้างจาก LINE */
    newOwnerProfileId: uuid("new_owner_profile_id")
      .notNull()
      .references((): AnyPgColumn => ownerProfile.id),
    /** ลูกค้าเดิมที่เบอร์ตรงกัน */
    candidateCustomerId: uuid("candidate_customer_id")
      .notNull()
      .references((): AnyPgColumn => customer.id),
    /** E.164 */
    phoneEntered: text("phone_entered").notNull(),
    status: linkRequestStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("customer_link_request_organization_id_status_idx").on(t.organizationId, t.status)],
);

/** สัตว์เลี้ยง (ผูกกับ owner_profile ไม่ผูกร้าน) — US-03-02, US-03-11, US-11-02 */
export const pet = pgTable(
  "pet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerProfileId: uuid("owner_profile_id")
      .notNull()
      .references((): AnyPgColumn => ownerProfile.id),
    createdInOrgId: uuid("created_in_org_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    name: text("name").notNull(),
    species: speciesEnum("species").notNull(),
    /** ระบุเมื่อ species = other */
    speciesOther: text("species_other"),
    /** เลือกจากรายการหรือพิมพ์เอง */
    breed: text("breed"),
    sex: petSexEnum("sex").notNull().default("unknown"),
    birthDate: date("birth_date", { mode: "string" }),
    /** ใช้เมื่อไม่รู้วันเกิด (อายุ ณ created_at) */
    ageEstimateMonths: integer("age_estimate_months"),
    /** null = ไม่ทราบ */
    neutered: boolean("neutered"),
    color: text("color"),
    microchipNo: text("microchip_no"),
    /** แปลงเป็น coat_group ด้วย R-02 */
    coatType: coatTypeEnum("coat_type").notNull().default("unknown"),
    /** cache จาก pet_weight ล่าสุด */
    latestWeightGrams: integer("latest_weight_grams"),
    profileFileId: uuid("profile_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    /** deceased/rehomed → หยุดแจ้งเตือนทั้งหมด */
    status: petStatusEnum("status").notNull().default("active"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("pet_owner_profile_id_idx").on(t.ownerProfileId),
    check("pet_other_chk", sql`species <> 'other' or species_other is not null`),
    check("pet_weight_chk", sql`latest_weight_grams is null or latest_weight_grams > 0`),
  ],
);

/** ข้อมูลน้องที่เป็นของร้าน (กรูม/สุขภาพ/โน้ต) 1 แถวต่อ pet ต่อ org — US-03-03, US-03-04, US-03-07 */
export const petShopProfile = pgTable(
  "pet_shop_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id, { onDelete: "cascade" }),
    /** ทรงที่ชอบ */
    preferredStyle: text("preferred_style"),
    /** เบอร์ใบมีด */
    bladeNo: text("blade_no"),
    shampooOk: text("shampoo_ok"),
    shampooAvoid: text("shampoo_avoid"),
    allergies: text("allergies"),
    /** โรคประจำตัว */
    conditions: text("conditions"),
    medications: text("medications"),
    vetClinicName: text("vet_clinic_name"),
    vetClinicPhone: text("vet_clinic_phone"),
    /** ลูกค้าไม่เห็น และไม่แชร์ข้ามร้าน */
    internalNote: text("internal_note"),
    /** ลูกค้าเห็นใน LIFF */
    sharedNote: text("shared_note"),
    /** รูปทรงโปรด แสดงบน job card */
    favoriteStylePhotoId: uuid("favorite_style_photo_id").references((): AnyPgColumn => petPhoto.id, { onDelete: "set null" }),
    /** ร้านตั้งเอง (ชนะค่าคำนวณใน R-17) */
    groomIntervalDays: integer("groom_interval_days"),
    /** cache */
    lastGroomedAt: timestamp("last_groomed_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("pet_shop_profile_organization_id_pet_id_uq").on(t.organizationId, t.petId)],
);

/** ป้ายนิสัย — US-03-04 */
export const petTemperamentFlag = pgTable(
  "pet_temperament_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id, { onDelete: "cascade" }),
    flag: temperamentFlagEnum("flag").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pet_temperament_flag_organization_id_pet_id_flag_uq").on(t.organizationId, t.petId, t.flag)],
);

/** ประวัติน้ำหนัก — US-03-03, US-05-06 */
export const petWeight = pgTable(
  "pet_weight",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id, { onDelete: "cascade" }),
    /** > 0 */
    weightGrams: integer("weight_grams").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    source: recordSourceEnum("source").notNull().default("shop"),
    recordedBy: uuid("recorded_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** ถ้าชั่งตอนเช็คอิน */
    appointmentId: uuid("appointment_id").references((): AnyPgColumn => groomAppointment.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("pet_weight_pet_id_measured_at_idx").on(t.petId, t.measuredAt), check("pet_weight_pos_chk", sql`weight_grams > 0`)],
);

/** ชนิดวัคซีน (ข้อมูลกลาง seed) — US-03-05 */
export const vaccineType = pgTable("vaccine_type", {
  /** PK เช่น DOG_RABIES */
  code: text("code").primaryKey(),
  species: speciesEnum("species").notNull(),
  nameTh: text("name_th").notNull(),
  nameEn: text("name_en").notNull(),
  /** ใช้เติม expires_on อัตโนมัติ */
  defaultValidityMonths: integer("default_validity_months").notNull().default(12),
  sortOrder: integer("sort_order").notNull().default(0),
  /** เวลาสร้าง (UTC) */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** ประวัติวัคซีน — US-03-05, US-06-05, US-11-02 */
export const petVaccination = pgTable(
  "pet_vaccination",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id, { onDelete: "cascade" }),
    vaccineCode: text("vaccine_code")
      .notNull()
      .references((): AnyPgColumn => vaccineType.code),
    administeredOn: date("administered_on", { mode: "string" }),
    /** ใช้ตรวจ vaccine gate (R-11) */
    expiresOn: date("expires_on", { mode: "string" }).notNull(),
    /** รูปสมุดวัคซีน */
    proofFileId: uuid("proof_file_id").references((): AnyPgColumn => fileObject.id, { onDelete: "set null" }),
    /** ข้อมูลจากร้าน = verified ทันที */
    status: vaccineStatusEnum("status").notNull().default("pending_review"),
    source: recordSourceEnum("source").notNull().default("shop"),
    verifiedOrgId: uuid("verified_org_id").references((): AnyPgColumn => organization.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    rejectReason: text("reject_reason"),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate */
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("pet_vaccination_pet_id_vaccine_code_expires_on_idx").on(t.petId, t.vaccineCode, t.expiresOn)],
);

/** ไฟล์ทุกชนิดใน object storage (ไม่เก็บไฟล์ใน DB) — US-13-04 */
export const fileObject = pgTable(
  "file_object",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = ไฟล์ระดับแพลตฟอร์ม */
    organizationId: uuid("organization_id").references((): AnyPgColumn => organization.id, { onDelete: "cascade" }),
    kind: fileKindEnum("kind").notNull(),
    /** org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext} */
    storageKey: text("storage_key").notNull(),
    /** อนุญาต image/jpeg, image/png, image/webp, video/mp4, application/pdf, text/csv */
    mimeType: text("mime_type").notNull(),
    /** รูป ≤ 1.5MB หลังย่อ, วิดีโอ ≤ 20MB (R-25) */
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    uploadedByType: actorTypeEnum("uploaded_by_type").notNull(),
    uploadedById: uuid("uploaded_by_id"),
    /** null = อัปโหลดแต่ยังไม่ผูกกับข้อมูล (ลบทิ้งหลัง 24 ชม.) */
    committedAt: timestamp("committed_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("file_object_storage_key_uq").on(t.storageKey),
    index("file_object_organization_id_kind_idx").on(t.organizationId, t.kind),
    check("file_size_chk", sql`size_bytes > 0`),
  ],
);

/** คลังรูปน้อง (ก่อน-หลัง/ระหว่างพัก) — US-03-06, US-09-03, US-06-10 */
export const petPhoto = pgTable(
  "pet_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** tenant key — ทุก query ต้องกรองด้วยค่านี้ */
    organizationId: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organization.id),
    petId: uuid("pet_id")
      .notNull()
      .references((): AnyPgColumn => pet.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references((): AnyPgColumn => fileObject.id),
    kind: photoKindEnum("kind").notNull(),
    appointmentId: uuid("appointment_id").references((): AnyPgColumn => groomAppointment.id, { onDelete: "set null" }),
    stayId: uuid("stay_id").references((): AnyPgColumn => stay.id, { onDelete: "set null" }),
    caption: text("caption"),
    takenAt: timestamp("taken_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    uploadedBy: uuid("uploaded_by").references((): AnyPgColumn => staffUser.id, { onDelete: "set null" }),
    /** เวลาสร้าง (UTC) */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("pet_photo_pet_id_taken_at_idx").on(t.petId, t.takenAt), index("pet_photo_stay_id_idx").on(t.stayId)],
);
