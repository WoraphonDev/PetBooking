// R-11 — vaccine gate (04#R-11): every required code must be valid through `mustBeValidOn` (local dates, YYYY-MM-DD).

type Vaccination = { code: string; expiresOn: string; status: "pending_review" | "verified" | "rejected" };

export function checkVaccines(input: { requiredCodes: string[]; vaccinations: Vaccination[]; mustBeValidOn: string }): {
  ok: boolean;
  missing: string[];
  expired: string[];
  pendingReview: string[];
} {
  const missing: string[] = [];
  const expired: string[] = [];
  const pendingReview: string[] = [];
  // YYYY-MM-DD strings compare in calendar order; the expiry day itself still counts as valid
  const validOn = (v: Vaccination) => v.expiresOn >= input.mustBeValidOn;

  for (const code of input.requiredCodes) {
    // 2. rejected records count as no record
    const records = input.vaccinations.filter((v) => v.code === code && v.status !== "rejected");
    if (records.length === 0) missing.push(code);
    else if (records.some((v) => v.status === "verified" && validOn(v))) continue;
    else if (records.some((v) => v.status === "pending_review" && validOn(v))) pendingReview.push(code);
    else expired.push(code);
  }
  // 3. ok = none of the three lists
  return { ok: missing.length + expired.length + pendingReview.length === 0, missing, expired, pendingReview };
}
