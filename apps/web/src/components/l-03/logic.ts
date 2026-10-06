// L-03 pure helpers: age text, vaccine-expiry warning, form ⇄ liff.createPet / liff.updatePet body.
import type { MyPet } from "@app/contracts/dto/my-pet";
import { LiffCreatePetRequest } from "@app/contracts/endpoints/liff.createPet";
import type { CoatType, PetSex, Species } from "@app/contracts/enums";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";

/** a vaccine expiring within this many days (or already expired) shows red on the pet card (Q-1043) */
export const VACCINE_WARN_DAYS = 30;

export const vaccineOptions = (species: string) =>
  referenceData.vaccineTypes.filter((v) => v.species === species).sort((a, b) => a.sortOrder - b.sortOrder);

export const breedOptions = (species: string): string[] => (referenceData.breeds as Record<string, string[]>)[species] ?? [];

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** whole months between a birth date and today (local dates) */
export function monthsBetween(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0));
}

/** age in months and whether it is the owner's estimate; null when neither is known */
export function petAge(p: Pick<MyPet, "birthDate" | "ageEstimateMonths">, today: string): { months: number; estimate: boolean } | null {
  if (p.birthDate) return { months: monthsBetween(p.birthDate, today), estimate: false };
  return p.ageEstimateMonths === null ? null : { months: p.ageEstimateMonths, estimate: true };
}

/** any verified/pending vaccination expired or expiring within VACCINE_WARN_DAYS (rejected ones do not count) */
export function vaccineSoon(p: Pick<MyPet, "vaccinations">, today: string): boolean {
  return p.vaccinations.some((v) => v.status !== "rejected" && days(today, v.expiresOn) <= VACCINE_WARN_DAYS);
}

export type PetForm = {
  name: string;
  species: Species | null;
  speciesOther: string;
  breed: string;
  sex: PetSex | null;
  birthUnknown: boolean;
  birthDate: string | null;
  ageYears: string;
  ageMonths: string;
  neutered: boolean | null;
  coatType: CoatType | null;
  weightGrams: number | null;
  profileFileId: string | null;
};

export const emptyForm = (): PetForm => ({
  name: "",
  species: null,
  speciesOther: "",
  breed: "",
  sex: null,
  birthUnknown: false,
  birthDate: null,
  ageYears: "",
  ageMonths: "",
  neutered: null,
  coatType: null,
  weightGrams: null,
  profileFileId: null,
});

export function formOf(p: MyPet): PetForm {
  const est = p.ageEstimateMonths;
  return {
    ...emptyForm(),
    name: p.name,
    species: p.species,
    speciesOther: p.speciesOther ?? "",
    breed: p.breed ?? "",
    sex: p.sex,
    birthUnknown: !p.birthDate && est !== null,
    birthDate: p.birthDate,
    ageYears: est === null ? "" : String(Math.floor(est / 12)),
    ageMonths: est === null ? "" : String(est % 12),
    neutered: p.neutered,
    coatType: p.coatType,
  };
}

/** body for liff.createPet / liff.updatePet (same fields, Q-1034); empty optional fields are left out */
export function petBody(f: PetForm) {
  const months = Number(f.ageYears || 0) * 12 + Number(f.ageMonths || 0);
  return {
    name: f.name.trim(),
    species: f.species ?? undefined,
    ...(f.species === "other" ? { speciesOther: f.speciesOther.trim() } : {}),
    ...(f.breed.trim() ? { breed: f.breed.trim() } : {}),
    sex: f.sex ?? undefined,
    ...(f.birthUnknown ? (f.ageYears || f.ageMonths ? { ageEstimateMonths: months } : {}) : f.birthDate ? { birthDate: f.birthDate } : {}),
    ...(f.neutered === null ? {} : { neutered: f.neutered }),
    coatType: f.coatType ?? undefined,
    ...(f.weightGrams ? { weightGrams: f.weightGrams } : {}),
    ...(f.profileFileId ? { profileFileId: f.profileFileId } : {}),
  };
}

/** the same zod schema as the API (06 กติการ่วม) */
export const PetFormSchema = LiffCreatePetRequest;
