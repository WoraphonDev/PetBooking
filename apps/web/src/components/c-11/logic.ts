// 06#scr-C-11 — pet profile helpers (profile form shared with C-09's add-pet dialog).
import type { PetDetail } from "@app/contracts/dto/pet-detail";
import type { PetsSetFlagsRequest } from "@app/contracts/endpoints/pets.setFlags";
import type { PetsUpdateRequest } from "@app/contracts/endpoints/pets.update";
import type { PetsUpdateShopProfileRequest } from "@app/contracts/endpoints/pets.updateShopProfile";
import type { VaccinationsCreateRequest } from "@app/contracts/endpoints/vaccinations.create";
import type { TemperamentFlag } from "@app/contracts/enums";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";
import { type PetForm, petBody } from "../c-09/pet-form";
import { phoneValue } from "../shared/form";

export const TABS = ["profile", "grooming", "health", "vaccines", "photos", "weight"] as const;
export type Tab = (typeof TABS)[number];
export const parseTab = (v: string | null): Tab => ((TABS as readonly string[]).includes(v ?? "") ? (v as Tab) : "profile");
/** staff may edit the grooming / health tabs only (06 ปุ่ม บันทึก) */
export const canEdit = (tab: Tab, role: string | undefined) =>
  role === "owner" || role === "front_desk" || (role === "staff" && (tab === "grooming" || tab === "health"));

export function petFormFrom(p: PetDetail): PetForm {
  return {
    profilePhoto: null,
    name: p.name,
    species: p.species,
    speciesOther: p.speciesOther ?? "",
    breed: p.breed ?? "",
    sex: p.sex,
    birthDate: p.birthDate,
    ageEstimateMonths: p.ageEstimateMonths === null ? "" : String(p.ageEstimateMonths),
    neutered: p.neutered,
    color: p.color ?? "",
    microchipNo: p.microchipNo ?? "",
    coatType: p.coatType,
  };
}
/** pets.update: the profile tab's fields (a new photo only when one was uploaded) */
export const profileBody = (f: PetForm): PetsUpdateRequest => petBody(f);

export type ShopForm = Omit<PetsUpdateShopProfileRequest, "groomIntervalDays" | "vetClinicPhone" | "favoriteStylePhotoId"> & {
  groomIntervalDays: string;
  vetClinicPhone: string;
  /** undefined = unchanged (the DTO only carries the photo URL) */
  favoriteStylePhotoId?: string | null;
};
export function shopFormFrom(p: PetDetail): ShopForm {
  const s = p.shop;
  return {
    preferredStyle: s.preferredStyle,
    bladeNo: s.bladeNo,
    shampooOk: s.shampooOk,
    shampooAvoid: s.shampooAvoid,
    allergies: s.allergies,
    conditions: s.conditions,
    medications: s.medications,
    vetClinicName: s.vetClinicName,
    vetClinicPhone: s.vetClinicPhone ?? "",
    internalNote: s.internalNote,
    sharedNote: s.sharedNote,
    groomIntervalDays: s.groomIntervalDays === null ? "" : String(s.groomIntervalDays),
  };
}
export type ShopErrors = Partial<Record<"groomIntervalDays" | "vetClinicPhone", true>>;
/** รอบกรูม 7–180 (ว่าง = อัตโนมัติ R-17) · เบอร์คลินิก R-22 */
export function validateShop(f: ShopForm): ShopErrors {
  const e: ShopErrors = {};
  const d = f.groomIntervalDays.trim();
  if (d && !(/^\d+$/.test(d) && Number(d) >= 7 && Number(d) <= 180)) e.groomIntervalDays = true;
  if (phoneValue(f.vetClinicPhone).error) e.vetClinicPhone = true;
  return e;
}
const clear = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
/** pets.updateShopProfile for one tab (only that tab's keys; blank = cleared) */
export function shopBody(f: ShopForm, tab: "grooming" | "health"): PetsUpdateShopProfileRequest {
  if (tab === "grooming")
    return {
      preferredStyle: clear(f.preferredStyle),
      bladeNo: clear(f.bladeNo),
      shampooOk: clear(f.shampooOk),
      shampooAvoid: clear(f.shampooAvoid),
      groomIntervalDays: f.groomIntervalDays.trim() ? Number(f.groomIntervalDays) : null,
      ...(f.favoriteStylePhotoId !== undefined ? { favoriteStylePhotoId: f.favoriteStylePhotoId } : {}),
    };
  return {
    allergies: clear(f.allergies),
    conditions: clear(f.conditions),
    medications: clear(f.medications),
    vetClinicName: clear(f.vetClinicName),
    vetClinicPhone: phoneValue(f.vetClinicPhone).e164,
    internalNote: clear(f.internalNote),
    sharedNote: clear(f.sharedNote),
  };
}

export type FlagRow = { flag: TemperamentFlag; note: string };
/** pets.setFlags (whole set); null while "other" has no note */
export function flagsBody(rows: FlagRow[]): PetsSetFlagsRequest | null {
  if (rows.some((r) => r.flag === "other" && !r.note.trim())) return null;
  return { flags: rows.map((r) => (r.note.trim() ? { flag: r.flag, note: r.note.trim() } : { flag: r.flag })) };
}

/** vaccine_type (10 §1) for the pet's species */
export const vaccineOptions = (species: string) =>
  referenceData.vaccineTypes.filter((v) => v.species === species).sort((a, b) => a.sortOrder - b.sortOrder);

/** หมดอายุ prefill: administered + default_validity_months (same day of month, clamped) */
export function defaultExpiry(administeredOn: string, months: number): string {
  const [y, m, d] = administeredOn.split("-").map(Number) as [number, number, number];
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** expired or within 30 days → red */
export function expiryWarning(expiresOn: string, today: string): boolean {
  const days = (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 30;
}

export type VaccineForm = { vaccineCode: string; administeredOn: string | null; expiresOn: string | null; proofFileId: string | null };
export function vaccineBody(f: VaccineForm): VaccinationsCreateRequest | null {
  if (!f.vaccineCode || (!f.administeredOn && !f.expiresOn)) return null;
  return {
    vaccineCode: f.vaccineCode,
    ...(f.administeredOn ? { administeredOn: f.administeredOn } : {}),
    ...(f.expiresOn ? { expiresOn: f.expiresOn } : {}),
    ...(f.proofFileId ? { proofFileId: f.proofFileId } : {}),
  };
}
