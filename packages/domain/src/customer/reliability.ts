// R-09 — customer reliability level 1–4 from the last 12 months (04#R-09). Counts are prepared by the caller.

export function computeReliability(input: {
  noShowCount12m: number;
  lateCancelCount12m: number;
  completedVisits12m: number;
  override: 1 | 2 | 3 | 4 | null;
}): { level: 1 | 2 | 3 | 4; source: "override" | "computed" } {
  const { noShowCount12m: noShow, lateCancelCount12m: late, completedVisits12m: completed } = input;
  // 1. a shop override always wins
  if (input.override !== null) return { level: input.override, source: "override" };
  // 2. high risk
  if (noShow >= 2 || (noShow >= 1 && late >= 2)) return { level: 1, source: "computed" };
  // 3. watch
  if (noShow === 1 || late >= 2) return { level: 2, source: "computed" };
  // 4. excellent: ≥ 5 completed visits and no late cancel / no-show
  if (completed >= 5 && late === 0 && noShow === 0) return { level: 4, source: "computed" };
  // 5. normal (new customers start here)
  return { level: 3, source: "computed" };
}
