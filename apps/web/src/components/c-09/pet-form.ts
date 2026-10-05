// "+ เพิ่มน้อง" dialog = the C-11 profile-tab fields (06#scr-C-11): state, 06 rules, pets.create body.
import type { PetsCreateRequest } from "@app/contracts/endpoints/pets.create";
import type { CoatType, PetSex, Species } from "@app/contracts/enums";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";

/** combobox รายการพันธุ์ (10 reference data) + free typing */
export const breedsFor = (species: Species): string[] =>
  species === "other" ? [] : ((referenceData.breeds as Record<"dog" | "cat", string[]>)[species] ?? []);

export type PetForm = {
  /** uploaded pet_profile file (url = local preview) */
  profilePhoto: { fileId: string; url: string } | null;
  name: string;
  species: Species;
  speciesOther: string;
  breed: string;
  sex: PetSex;
  birthDate: string | null;
  ageEstimateMonths: string;
  /** ใช่ / ไม่ / ไม่ทราบ */
  neutered: boolean | null;
  color: string;
  microchipNo: string;
  coatType: CoatType | null;
};
export const emptyPet = (): PetForm => ({
  profilePhoto: null,
  name: "",
  species: "dog",
  speciesOther: "",
  breed: "",
  sex: "unknown",
  birthDate: null,
  ageEstimateMonths: "",
  neutered: null,
  color: "",
  microchipNo: "",
  coatType: null,
});

export type PetErrors = Partial<Record<keyof PetForm, true>>;
/** 06: ชื่อ 1–40 · ระบุชนิดเมื่ออื่นๆ · วันเกิด ≤ วันนี้ · อายุประมาณ 0–360 · ไมโครชิป 15 หลัก · ประเภทขนบังคับ */
export function validatePet(f: PetForm, today: string): PetErrors {
  const e: PetErrors = {};
  const name = f.name.trim();
  if (name.length < 1 || name.length > 40) e.name = true;
  if (f.species === "other" && !f.speciesOther.trim()) e.speciesOther = true;
  if (f.breed.trim().length > 60) e.breed = true;
  if (f.birthDate && f.birthDate > today) e.birthDate = true;
  const age = f.ageEstimateMonths.trim();
  if (!f.birthDate && age && !(/^\d+$/.test(age) && Number(age) <= 360)) e.ageEstimateMonths = true;
  if (f.microchipNo.trim() && !/^\d{15}$/.test(f.microchipNo.trim())) e.microchipNo = true;
  if (!f.coatType) e.coatType = true;
  return e;
}

/** pets.create body (blank text left out; the estimate only without a birth date) */
export function petBody(f: PetForm): PetsCreateRequest {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    name: f.name.trim(),
    species: f.species,
    ...(f.species === "other" ? { speciesOther: f.speciesOther.trim() } : {}),
    ...(opt(f.breed) ? { breed: opt(f.breed) } : {}),
    sex: f.sex,
    ...(f.birthDate ? { birthDate: f.birthDate } : {}),
    ...(!f.birthDate && opt(f.ageEstimateMonths) ? { ageEstimateMonths: Number(f.ageEstimateMonths) } : {}),
    ...(f.neutered !== null ? { neutered: f.neutered } : {}),
    ...(opt(f.color) ? { color: opt(f.color) } : {}),
    ...(opt(f.microchipNo) ? { microchipNo: opt(f.microchipNo) } : {}),
    coatType: f.coatType ?? "unknown",
    ...(f.profilePhoto ? { profileFileId: f.profilePhoto.fileId } : {}),
  };
}
