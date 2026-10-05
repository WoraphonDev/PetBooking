// 06#scr-C-06 — check-in form rules, the groom.checkIn body and the SIZE_CHANGED follow-up for groom.setItems.
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { GroomCheckInRequest, GroomCheckInResponse } from "@app/contracts/endpoints/groom.checkIn";
import type { GroomSetItemsRequest } from "@app/contracts/endpoints/groom.setItems";

export const CONDITION_FLAGS = ["ticks_fleas", "wound", "matted", "skin_issue"] as const;
export type ConditionFlag = (typeof CONDITION_FLAGS)[number];
export const CONSENT_REASONS = ["matted_shave", "senior", "medical_condition", "aggressive", "other"] as const;
export type ConsentReason = (typeof CONSENT_REASONS)[number];

/** flags that need a consent (05#ep-groom.checkIn: matted or skin_issue → CONSENT_REQUIRED) */
const CONSENT_FLAGS: readonly ConditionFlag[] = ["matted", "skin_issue"];

export type CheckInForm = {
  /** grams; null = empty, undefined = not a valid kg text */
  weightGrams: number | null | undefined;
  conditionFlags: ConditionFlag[];
  conditionNote: string;
  /** กดเพิ่มเอง — consent without a flag that needs it */
  consentAdded: boolean;
  reasons: ConsentReason[];
  signerName: string;
  signatureFileId: string | null;
};
export type CheckInErrors = Partial<Record<"weightGrams" | "conditionNote" | "reasons" | "signerName" | "signatureFileId", true>>;

export const emptyCheckIn = (): CheckInForm => ({
  weightGrams: null,
  conditionFlags: [],
  conditionNote: "",
  consentAdded: false,
  reasons: [],
  signerName: "",
  signatureFileId: null,
});

/** 06: ใบยินยอม shows when ขนพันกัน/ผิวหนัง is ticked or the user adds it */
export const consentShown = (f: Pick<CheckInForm, "conditionFlags" | "consentAdded">) =>
  f.consentAdded || f.conditionFlags.some((x) => CONSENT_FLAGS.includes(x));

export const toggle = <V extends string>(list: V[], value: V, on: boolean): V[] =>
  on ? (list.includes(value) ? list : [...list, value]) : list.filter((x) => x !== value);

/** 06 กติกา: weight 0.1–150 kg, รายละเอียด ≤ 500, consent: reasons ≥ 1 + signer + signature */
export function checkInBody(f: CheckInForm): { body: GroomCheckInRequest | null; errors: CheckInErrors } {
  const errors: CheckInErrors = {};
  const w = f.weightGrams;
  if (w === undefined || (w !== null && (w < 100 || w > 150_000))) errors.weightGrams = true;
  const note = f.conditionNote.trim();
  if (note.length > 500) errors.conditionNote = true;
  const consent = consentShown(f);
  const signerName = f.signerName.trim();
  if (consent) {
    if (f.reasons.length === 0) errors.reasons = true;
    if (!signerName) errors.signerName = true;
    if (!f.signatureFileId) errors.signatureFileId = true;
  }
  if (Object.keys(errors).length > 0) return { body: null, errors };
  return {
    body: {
      ...(w != null ? { weightGrams: w } : {}),
      conditionFlags: f.conditionFlags,
      ...(note ? { conditionNote: note } : {}),
      ...(consent ? { consent: { reasons: f.reasons, signerName, signatureFileId: f.signatureFileId ?? undefined } } : {}),
    },
    errors,
  };
}

export type SizeChange = { newSizeTierId: string; newPriceSatang: number | null };

/** warnings[SIZE_CHANGED {newSizeTierId, newPriceSatang}] from groom.checkIn, else null */
export function sizeChange(res: Pick<GroomCheckInResponse, "warnings">): SizeChange | null {
  const w = res.warnings?.find((x) => x.code === "SIZE_CHANGED");
  const data = (w?.data ?? {}) as { newSizeTierId?: unknown; newPriceSatang?: unknown };
  if (!w || typeof data.newSizeTierId !== "string") return null;
  return {
    newSizeTierId: data.newSizeTierId,
    newPriceSatang: typeof data.newPriceSatang === "number" ? data.newPriceSatang : null,
  };
}

/** ปรับบริการ/ขนาดตามน้ำหนักวันนี้: same services and add-ons at the new size tier (R-02/R-03 reprice on the server) */
export function setItemsBody(a: Pick<AppointmentCard, "items">, change: SizeChange): GroomSetItemsRequest {
  return {
    serviceIds: a.items.filter((i) => !i.isAddon).map((i) => i.serviceId),
    addonIds: a.items.filter((i) => i.isAddon).map((i) => i.serviceId),
    sizeTierId: change.newSizeTierId,
    priceOverrides: [],
  };
}
