// 06#scr-C-33 — pure helpers for the shop policy form.
import type { BranchPolicy } from "@app/contracts/dto/branch-policy";
import { BranchUpdatePolicyRequest } from "@app/contracts/endpoints/branch.updatePolicy";
import { formatTHB } from "@app/domain/format/thai";
import { computeDeposit } from "@app/domain/payment/deposit";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";

export const LEAD_OPTIONS = [0, 30, 60, 120, 240, 1440] as const;
export const SLOT_STEP_OPTIONS = [5, 10, 15, 30] as const;
export const HOLD_OPTIONS = [10, 15, 30, 60] as const;
export const POLICY_TEXT_MAX = 2000;
/** ตัวอย่าง: R-06 on an estimate of ฿850 */
export const EXAMPLE_TOTAL_SATANG = 85_000;

/** vaccine_type (10 §1) — codes + Thai names for the multi-selects */
export const vaccineTypes = (species: "dog" | "cat") =>
  referenceData.vaccineTypes.filter((v) => v.species === species).sort((a, b) => a.sortOrder - b.sortOrder);

/** ใบยินยอม / ข้อตกลงรับฝาก templates (10 §4) */
export const TEMPLATES = {
  groomingConsentText: referenceData.templates.grooming_consent_text,
  boardingAgreementText: referenceData.templates.boarding_agreement_text,
} as const;

/**
 * 10 §4 policy_text_generator: the quoted strings in order are the sentence, the three {deposit} variants
 * ('ไม่เก็บ' | '฿{fixed}' | '{percent}% ของยอดประเมิน') and the three {refund_mode} variants (refund | credit | customer_choice).
 */
const generator = (() => {
  const quoted = [...referenceData.templates.policy_text_generator.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? "");
  const [sentence = "", none = "", fixed = "", percent = "", refund = "", credit = "", choice = ""] = quoted;
  return { sentence, deposit: { none, fixed, percent }, refund: { refund, credit, customer_choice: choice } };
})();

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

/** "สร้างจากค่าข้างบน" — the customer-facing policy text from the current values */
export function generatePolicyText(p: BranchPolicy): string {
  const deposit =
    p.defaultDepositType === "none"
      ? generator.deposit.none
      : p.defaultDepositType === "fixed"
        ? // '฿{fixed}' — formatTHB already prints the ฿
          formatTHB({ satang: p.defaultDepositValue })
        : fill(generator.deposit.percent, { percent: p.defaultDepositValue });
  return fill(generator.sentence, {
    deposit,
    grooming_h: p.groomingFreeCancelHours,
    hotel_h: p.hotelFreeCancelHours,
    daycare_h: p.daycareFreeCancelHours,
    forfeit: p.lateCancelForfeitPercent,
    refund_mode: generator.refund[p.cancelRefundMode],
    reschedule_h: p.rescheduleCutoffHours,
  });
}

/** ตัวอย่าง: what a regular customer (level 3) pays on ฿850 under the current deposit setting */
export function depositExample(p: Pick<BranchPolicy, "defaultDepositType" | "defaultDepositValue">): number {
  return computeDeposit({
    estimatedTotalSatang: EXAMPLE_TOTAL_SATANG,
    policy: { type: p.defaultDepositType, value: p.defaultDepositValue },
    customer: { depositExempt: false, reliabilityLevel: 3 },
  }).depositRequiredSatang;
}

export type PolicyErrors = Partial<Record<keyof BranchPolicy, true>>;

/** 06 กติกา on top of the zod contract (ranges the contract leaves open) */
export function validatePolicy(p: BranchPolicy): PolicyErrors {
  const errors: PolicyErrors = {};
  const bad = (key: keyof BranchPolicy, ok: boolean) => {
    if (!ok) errors[key] = true;
  };
  const between = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  bad("defaultDepositValue", p.defaultDepositType === "percent" ? between(p.defaultDepositValue, 0, 100) : p.defaultDepositValue >= 0);
  bad("groomingFreeCancelHours", between(p.groomingFreeCancelHours, 0, 168));
  bad("hotelFreeCancelHours", between(p.hotelFreeCancelHours, 0, 336));
  bad("bookingHorizonDays", between(p.bookingHorizonDays, 1, 180));
  bad("bufferMinutes", between(p.bufferMinutes, 0, 60));
  bad("nextGroomDefaultDays", between(p.nextGroomDefaultDays, 7, 180));
  bad("policyText", (p.policyText ?? "").length <= POLICY_TEXT_MAX);
  // everything else: the shared zod schema (same as the API)
  const parsed = BranchUpdatePolicyRequest.safeParse(updateBody(p));
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") errors[key as keyof BranchPolicy] = true;
    }
  return errors;
}

/** branch.updatePolicy body: every field (texts are NOT NULL in 02 — empty = none) */
export function updateBody(p: BranchPolicy): BranchUpdatePolicyRequest {
  return {
    ...p,
    slotStepMinutes: p.slotStepMinutes as 5 | 10 | 15 | 30,
    groomingConsentText: p.groomingConsentText ?? "",
    boardingAgreementText: p.boardingAgreementText ?? "",
    policyText: p.policyText ?? "",
    googleReviewUrl: p.googleReviewUrl?.trim() ? p.googleReviewUrl.trim() : null,
  };
}

/** number field text → int | null (empty) | NaN (not a number → flagged by validation) */
export function parseIntField(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** rejected breeds tag input: trim, drop empties and duplicates */
export function addTag(tags: string[], value: string): string[] {
  const v = value.trim();
  return v && !tags.includes(v) ? [...tags, v] : tags;
}
