// R-12 — booking eligibility for customer / pet / room type (04#R-12). Reasons are error codes in check order.

type EligibilityInput = {
  channel: "online" | "staff";
  customer: { blacklisted: boolean };
  pet: {
    status: "active" | "deceased" | "rehomed";
    species: "dog" | "cat" | "other";
    breed: string | null;
    weightGrams: number | null;
    ageMonths: number | null;
    flags: string[];
  };
  policy: { rejectedBreeds: string[]; maxPetWeightGrams: number | null };
  /** service.species_allowed or room_type.species_allowed; [] = all */
  speciesAllowed: ("dog" | "cat" | "other")[];
  roomType: { maxWeightGrams: number | null; minAgeMonths: number | null; allowInHeat: boolean; allowReactive: boolean } | null;
  inHeat: boolean;
};

const REACTIVE_FLAGS = ["bites", "dog_reactive", "cat_reactive"];
const norm = (s: string) => s.trim().toLowerCase();

export function checkEligibility(input: EligibilityInput): { ok: boolean; reasons: string[] } {
  const { pet, roomType } = input;
  const reasons: string[] = [];
  // 1. the shop may still book a blacklisted customer itself
  if (input.channel === "online" && input.customer.blacklisted) reasons.push("CUSTOMER_BLACKLISTED");
  // 2.
  if (pet.status !== "active") reasons.push("PET_INACTIVE");
  // 3.
  if (input.speciesAllowed.length > 0 && !input.speciesAllowed.includes(pet.species)) reasons.push("SPECIES_NOT_ALLOWED");
  // 4. trimmed, case-insensitive
  if (pet.breed !== null && input.policy.rejectedBreeds.some((b) => norm(b) === norm(pet.breed ?? ""))) reasons.push("BREED_REJECTED");
  // 5. lowest of the shop and room limits; unknown weight is not checked
  const limits = [input.policy.maxPetWeightGrams, roomType?.maxWeightGrams ?? null].filter((n): n is number => n !== null);
  if (pet.weightGrams !== null && limits.length > 0 && pet.weightGrams > Math.min(...limits)) reasons.push("PET_TOO_HEAVY");
  // 6. room type rules (unknown age is not checked)
  if (roomType) {
    if (roomType.minAgeMonths !== null && pet.ageMonths !== null && pet.ageMonths < roomType.minAgeMonths) reasons.push("PET_TOO_YOUNG");
    if (input.inHeat && !roomType.allowInHeat) reasons.push("IN_HEAT_NOT_ALLOWED");
    if (!roomType.allowReactive && pet.flags.some((f) => REACTIVE_FLAGS.includes(f))) reasons.push("REACTIVE_NOT_ALLOWED");
  }
  return { ok: reasons.length === 0, reasons };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parts(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`invalid local date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/** whole calendar months from `from` to `to` (a month counts once its day-of-month is reached) */
function fullMonths(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

export function ageInMonths(input: {
  onDate: string;
  birthDate?: string | null;
  ageEstimateMonths?: number | null;
  estimateRecordedOn?: string | null;
}): number | null {
  // 7. birth date first, else the estimate plus months since it was recorded (pet.created_at); unknown → null
  if (input.birthDate) return fullMonths(input.birthDate, input.onDate);
  if (input.ageEstimateMonths != null && input.estimateRecordedOn)
    return input.ageEstimateMonths + fullMonths(input.estimateRecordedOn, input.onDate);
  return null;
}
