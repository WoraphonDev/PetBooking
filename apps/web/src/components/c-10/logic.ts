// 06#scr-C-10 — customer form state, 06 rules and the create / update bodies.
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { CustomersCreateRequest } from "@app/contracts/endpoints/customers.create";
import type { CustomersUpdateRequest } from "@app/contracts/endpoints/customers.update";
import type { BookingChannel, PhotoConsent } from "@app/contracts/enums";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";
import { phoneValue } from "../shared/form";

/** select 77 จังหวัด (10 reference data) */
export const PROVINCES: readonly string[] = referenceData.provinces;
export const PHOTO_CONSENTS = ["granted", "denied", "unknown"] as const;

export type CustomerForm = {
  firstName: string;
  lastName: string;
  nickname: string;
  /** typed text; E.164 via phoneValue (R-22) */
  phone: string;
  email: string;
  birthDate: string | null;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  sourceChannel: BookingChannel;
  referralNote: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  photoConsent: PhotoConsent;
  depositExempt: boolean;
  internalNote: string;
};

export const emptyForm = (): CustomerForm => ({
  firstName: "",
  lastName: "",
  nickname: "",
  phone: "",
  email: "",
  birthDate: null,
  addressLine: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  sourceChannel: "walk_in",
  referralNote: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  photoConsent: "unknown",
  depositExempt: false,
  internalNote: "",
});

/** แสดง+แก้: prefill from customers.get (role-hidden keys come back as undefined → empty) */
export function formFrom(c: CustomerDetail): CustomerForm {
  return {
    firstName: c.firstName,
    lastName: c.lastName ?? "",
    nickname: c.nickname ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    birthDate: c.birthDate,
    addressLine: c.addressLine ?? "",
    subdistrict: c.subdistrict ?? "",
    district: c.district ?? "",
    province: c.province ?? "",
    postalCode: c.postalCode ?? "",
    sourceChannel: c.sourceChannel,
    referralNote: c.referralNote ?? "",
    emergencyContactName: c.emergencyContactName ?? "",
    emergencyContactPhone: c.emergencyContactPhone ?? "",
    photoConsent: c.photoConsent,
    depositExempt: c.depositExempt,
    internalNote: c.internalNote ?? "",
  };
}

export type FormErrors = Partial<Record<keyof CustomerForm, true>>;
/** 06 กติกา: ชื่อ 1–60 · นามสกุล ≤ 60 · ชื่อเล่น ≤ 30 · R-22 phones · ^\d{5}$ · โน้ต ≤ 2000 */
export function validate(f: CustomerForm): FormErrors {
  const e: FormErrors = {};
  const first = f.firstName.trim();
  if (first.length < 1 || first.length > 60) e.firstName = true;
  if (f.lastName.trim().length > 60) e.lastName = true;
  if (f.nickname.trim().length > 30) e.nickname = true;
  if (phoneValue(f.phone).error) e.phone = true;
  if (phoneValue(f.emergencyContactPhone).error) e.emergencyContactPhone = true;
  if (f.postalCode.trim() && !/^\d{5}$/.test(f.postalCode.trim())) e.postalCode = true;
  if (f.internalNote.length > 2000) e.internalNote = true;
  return e;
}

const text = (v: string) => (v.trim() ? v.trim() : undefined);
const e164 = (v: string) => phoneValue(v).e164 ?? undefined;

/** customers.create carries only these fields (05); blank text is left out */
export function createBody(f: CustomerForm): CustomersCreateRequest {
  return {
    firstName: f.firstName.trim(),
    lastName: text(f.lastName),
    nickname: text(f.nickname),
    phone: e164(f.phone),
    email: text(f.email),
    sourceChannel: f.sourceChannel,
    referralNote: text(f.referralNote),
    internalNote: text(f.internalNote),
    photoConsent: f.photoConsent,
  };
}

/**
 * The rest of the form after customers.create (birth date, address, emergency contact, deposit exempt), sent with
 * customers.update right away — null when the user filled none of them (Q-1014).
 */
export function followUpBody(f: CustomerForm, isOwner: boolean): CustomersUpdateRequest | null {
  const body: CustomersUpdateRequest = {
    ...(f.birthDate ? { birthDate: f.birthDate } : {}),
    ...(text(f.addressLine) ? { addressLine: text(f.addressLine) } : {}),
    ...(text(f.subdistrict) ? { subdistrict: text(f.subdistrict) } : {}),
    ...(text(f.district) ? { district: text(f.district) } : {}),
    ...(text(f.province) ? { province: text(f.province) } : {}),
    ...(text(f.postalCode) ? { postalCode: text(f.postalCode) } : {}),
    ...(text(f.emergencyContactName) ? { emergencyContactName: text(f.emergencyContactName) } : {}),
    ...(e164(f.emergencyContactPhone) ? { emergencyContactPhone: e164(f.emergencyContactPhone) } : {}),
    ...(isOwner && f.depositExempt ? { depositExempt: true } : {}),
  };
  return Object.keys(body).length ? body : null;
}

/**
 * customers.update for the edit form: every field it accepts (blank = cleared). sourceChannel / referralNote are not
 * accepted by customers.update (Q-1014); depositExempt only for the owner.
 */
export function updateBody(f: CustomerForm, isOwner: boolean): CustomersUpdateRequest {
  const clear = (v: string) => (v.trim() ? v.trim() : null);
  return {
    firstName: f.firstName.trim(),
    lastName: clear(f.lastName),
    nickname: clear(f.nickname),
    phone: phoneValue(f.phone).e164,
    email: clear(f.email),
    birthDate: f.birthDate,
    addressLine: clear(f.addressLine),
    subdistrict: clear(f.subdistrict),
    district: clear(f.district),
    province: clear(f.province),
    postalCode: clear(f.postalCode),
    emergencyContactName: clear(f.emergencyContactName),
    emergencyContactPhone: phoneValue(f.emergencyContactPhone).e164,
    internalNote: clear(f.internalNote),
    photoConsent: f.photoConsent,
    ...(isOwner ? { depositExempt: f.depositExempt } : {}),
  };
}

/** DUPLICATE_PHONE warning of customers.create → the existing customers to link */
export function duplicateIds(warnings: { code: string; data: unknown }[] | undefined): string[] {
  const w = warnings?.find((x) => x.code === "DUPLICATE_PHONE");
  const ids = (w?.data as { duplicateCustomerIds?: unknown } | undefined)?.duplicateCustomerIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}
