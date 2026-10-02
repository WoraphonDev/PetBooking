// R-02 — coat group and service price/duration lookup (04#R-02). `prices` must already be the branch's default rate plan.

type CoatType = "short" | "long" | "double" | "curly" | "wire" | "hairless" | "unknown";
type CoatGroup = "short" | "long" | "any";
type PriceRow = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; priceSatang: number; durationMinutes: number };
type PriceLookupInput = { serviceId: string; sizeTierId: string | null; coatGroup: CoatGroup; prices: PriceRow[] };
type PriceLookupResult = {
  priceSatang: number;
  durationMinutes: number;
  matched: "tier+coat" | "tier+any" | "all+coat" | "all+any";
} | null;

const COAT_GROUP: Record<CoatType, CoatGroup> = {
  short: "short",
  hairless: "short",
  wire: "short",
  long: "long",
  double: "long",
  curly: "long",
  unknown: "any",
};

export function coatGroupOf(input: { coatType: CoatType }): CoatGroup {
  // 1. short/hairless/wire → short; long/double/curly → long; unknown → any
  return COAT_GROUP[input.coatType];
}

export function lookupServicePrice(input: PriceLookupInput): PriceLookupResult {
  const { sizeTierId, coatGroup } = input;
  const rows = input.prices.filter((p) => p.serviceId === input.serviceId);
  // 2. most specific first; skip coat steps when coatGroup = any, tier steps when sizeTierId = null
  const steps: { tier: string | null; coat: CoatGroup; matched: NonNullable<PriceLookupResult>["matched"] }[] = [
    ...(sizeTierId !== null && coatGroup !== "any" ? [{ tier: sizeTierId, coat: coatGroup, matched: "tier+coat" as const }] : []),
    ...(sizeTierId !== null ? [{ tier: sizeTierId, coat: "any" as const, matched: "tier+any" as const }] : []),
    ...(coatGroup !== "any" ? [{ tier: null, coat: coatGroup, matched: "all+coat" as const }] : []),
    { tier: null, coat: "any", matched: "all+any" },
  ];
  for (const step of steps) {
    const row = rows.find((p) => p.sizeTierId === step.tier && p.coatGroup === step.coat);
    if (row) return { priceSatang: row.priceSatang, durationMinutes: row.durationMinutes, matched: step.matched };
  }
  // 3. not offered for this size/coat → caller answers PRICE_NOT_FOUND
  return null;
}
