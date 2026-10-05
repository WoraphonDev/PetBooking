// 06#scr-C-42 — commission rules form helpers.
import type { CommissionRuleItem } from "@app/contracts/dto/commission-rule-item";
import type { CommissionRulesSetRequest } from "@app/contracts/endpoints/commissionRules.set";
import type { CommissionType } from "@app/contracts/enums";
import { bahtToSatang, satangToBahtText } from "../shared/form";

/** one row being edited; `value` is the stored int (bps for percent, satang for fixed); NaN = not a valid number */
export type RuleRow = { key: string; serviceId: string | null; staffUserId: string | null; type: CommissionType; value: number };

let seq = 0;
export const newRow = (over: Partial<RuleRow> = {}): RuleRow => ({
  key: `rule-${++seq}`,
  serviceId: null,
  staffUserId: null,
  type: "percent",
  value: 0,
  ...over,
});
export const rowsOf = (rules: CommissionRuleItem[]): RuleRow[] =>
  rules.map((r) => newRow({ serviceId: r.serviceId, staffUserId: r.staffUserId, type: r.type, value: r.value }));

/** % with 2 decimals → bps ("12.5" → 1250); the same 2-decimal conversion as baht → satang */
export const percentToBps = (text: string): number | null | undefined => bahtToSatang(text);
export const bpsToPercentText = (bps: number): string => satangToBahtText(bps);

/** R-13 precedence rank (lower = chosen first) — used to order the table */
export const precedence = (r: Pick<RuleRow, "serviceId" | "staffUserId">): number =>
  r.serviceId && r.staffUserId ? 0 : r.serviceId ? 1 : r.staffUserId ? 2 : 3;

export type RowError = "value" | "duplicate";
/** per-row problems: value out of range / not a number, or a second rule for the same (service, staff) */
export function rowErrors(rows: RuleRow[]): Record<string, RowError> {
  const errors: Record<string, RowError> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const id = `${r.serviceId ?? "*"}|${r.staffUserId ?? "*"}`;
    if (!Number.isInteger(r.value) || r.value < 0 || (r.type === "percent" && r.value > 10_000)) errors[r.key] = "value";
    else if (seen.has(id)) errors[r.key] = "duplicate";
    seen.add(id);
  }
  return errors;
}

/** commissionRules.set body (replaces the whole set); null while a row is invalid */
export function setBody(rows: RuleRow[]): CommissionRulesSetRequest | null {
  if (Object.keys(rowErrors(rows)).length) return null;
  return { rules: rows.map((r) => ({ serviceId: r.serviceId, staffUserId: r.staffUserId, type: r.type, value: r.value })) };
}
