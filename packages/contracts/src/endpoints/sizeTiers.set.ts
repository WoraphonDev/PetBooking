import { z } from "zod";
import { Uuid } from "../common.ts";
import { SizeTierItem } from "../dto/size-tier-item.ts";

const SizeTierInput = z
  .object({
    id: Uuid.optional(),
    code: z.string().regex(/^[A-Z]{1,4}$/),
    labelTh: z.string().min(1).max(30),
    minWeightGrams: z.number().int(),
    maxWeightGrams: z.number().int().nullable().optional(),
  })
  .refine((t) => t.maxWeightGrams == null || t.maxWeightGrams > t.minWeightGrams, {
    path: ["maxWeightGrams"],
    message: "maxWeightGrams must be greater than minWeightGrams",
  });

export const SizeTiersSetRequest = z
  .object({
    species: z.enum(["dog", "cat"]),
    tiers: z.array(SizeTierInput),
  })
  .superRefine((b, issue) => {
    const codes = new Set<string>();
    const ids = new Set<string>();
    b.tiers.forEach((t, i) => {
      if (codes.has(t.code)) issue.addIssue({ code: "custom", path: ["tiers", i, "code"], message: "duplicate code" });
      codes.add(t.code);
      if (t.id && ids.has(t.id)) issue.addIssue({ code: "custom", path: ["tiers", i, "id"], message: "duplicate id" });
      if (t.id) ids.add(t.id);
    });
  });
export type SizeTiersSetRequest = z.infer<typeof SizeTiersSetRequest>;
export const SizeTiersSetResponse = z.array(SizeTierItem);
export type SizeTiersSetResponse = z.infer<typeof SizeTiersSetResponse>;
