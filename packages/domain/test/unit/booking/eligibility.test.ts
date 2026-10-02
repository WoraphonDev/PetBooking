import { describe, expect, it } from "vitest";
import { ageInMonths, checkEligibility } from "../../../src/booking/eligibility.ts";

const base = {
  channel: "online" as const,
  customer: { blacklisted: false },
  pet: { status: "active" as const, species: "dog" as const, breed: null, weightGrams: null, ageMonths: null, flags: [] as string[] },
  policy: { rejectedBreeds: ["Pit Bull Terrier"], maxPetWeightGrams: null },
  speciesAllowed: [] as ("dog" | "cat" | "other")[],
  roomType: null,
  inHeat: false,
};
const room = { maxWeightGrams: null, minAgeMonths: 4, allowInHeat: false, allowReactive: false };

describe("checkEligibility (extra cases beyond the vectors)", () => {
  it("skips weight and age checks when they are unknown", () => {
    expect(checkEligibility({ ...base, roomType: { ...room, maxWeightGrams: 1000 } })).toEqual({ ok: true, reasons: [] });
  });

  it("uses the shop limit when there is no room type, and the lower of both otherwise", () => {
    const pet = { ...base.pet, weightGrams: 20000 };
    expect(checkEligibility({ ...base, pet, policy: { ...base.policy, maxPetWeightGrams: 19999 } }).reasons).toEqual(["PET_TOO_HEAVY"]);
    expect(
      checkEligibility({ ...base, pet, policy: { ...base.policy, maxPetWeightGrams: 30000 }, roomType: { ...room, maxWeightGrams: 20000 } })
        .ok,
    ).toBe(true);
  });

  it("ignores in-heat and reactive flags without a room type and when the room allows them", () => {
    const pet = { ...base.pet, flags: ["bites"] };
    expect(checkEligibility({ ...base, pet, inHeat: true }).ok).toBe(true);
    expect(checkEligibility({ ...base, pet, inHeat: true, roomType: { ...room, allowInHeat: true, allowReactive: true } }).ok).toBe(true);
    expect(checkEligibility({ ...base, pet: { ...base.pet, flags: ["cat_reactive"] }, roomType: room }).reasons).toEqual([
      "REACTIVE_NOT_ALLOWED",
    ]);
  });

  it("collects every failing reason in check order", () => {
    const r = checkEligibility({
      ...base,
      customer: { blacklisted: true },
      pet: { status: "rehomed", species: "other", breed: "PIT BULL TERRIER", weightGrams: 99999, ageMonths: 1, flags: ["dog_reactive"] },
      policy: { rejectedBreeds: ["pit bull terrier"], maxPetWeightGrams: 10 },
      speciesAllowed: ["dog"],
      roomType: room,
      inHeat: true,
    });
    expect(r.reasons).toEqual([
      "CUSTOMER_BLACKLISTED",
      "PET_INACTIVE",
      "SPECIES_NOT_ALLOWED",
      "BREED_REJECTED",
      "PET_TOO_HEAVY",
      "PET_TOO_YOUNG",
      "IN_HEAT_NOT_ALLOWED",
      "REACTIVE_NOT_ALLOWED",
    ]);
  });
});

describe("ageInMonths (extra cases beyond the vectors)", () => {
  it("counts the birthday month once the day is reached", () => {
    expect(ageInMonths({ onDate: "2026-10-10", birthDate: "2024-03-10" })).toBe(31);
    expect(ageInMonths({ onDate: "2026-10-05", birthDate: "2026-10-05" })).toBe(0);
  });

  it("prefers the birth date over an estimate and needs both estimate fields", () => {
    expect(ageInMonths({ onDate: "2026-10-05", birthDate: "2026-01-05", ageEstimateMonths: 99, estimateRecordedOn: "2020-01-01" })).toBe(9);
    expect(ageInMonths({ onDate: "2026-10-05", ageEstimateMonths: 12 })).toBeNull();
  });

  it("handles a zero estimate", () => {
    expect(ageInMonths({ onDate: "2026-10-05", ageEstimateMonths: 0, estimateRecordedOn: "2026-08-05" })).toBe(2);
  });
});
