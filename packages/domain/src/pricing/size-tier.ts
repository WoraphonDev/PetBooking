// R-01 — size tier from weight (04#R-01): branch tiers per species, lower bound inclusive, upper bound exclusive.

type SizeTierInput = {
  species: "dog" | "cat" | "other";
  weightGrams: number | null;
  tiers: { id: string; species: "dog" | "cat"; code: string; minWeightGrams: number; maxWeightGrams: number | null }[];
};
type SizeTierResult = { tierId: string | null; reason: "matched" | "no_weight" | "no_tier" };

export function resolveSizeTier(input: SizeTierInput): SizeTierResult {
  // 1. other animals only use price rows with size_tier_id = null
  if (input.species === "other") return { tierId: null, reason: "no_tier" };
  // 2. unknown weight: customer picks a size in LIFF / the shop weighs first
  if (input.weightGrams === null) return { tierId: null, reason: "no_weight" };
  const w = input.weightGrams;
  // 3. this species' tiers by min; first with min ≤ w < max (null max = no ceiling)
  const match = input.tiers
    .filter((t) => t.species === input.species)
    .sort((a, b) => a.minWeightGrams - b.minWeightGrams)
    .find((t) => t.minWeightGrams <= w && (t.maxWeightGrams === null || w < t.maxWeightGrams));
  // 4. nothing matches
  return match ? { tierId: match.id, reason: "matched" } : { tierId: null, reason: "no_tier" };
}
