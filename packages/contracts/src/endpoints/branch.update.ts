import { z } from "zod";
import referenceData from "../../../../docs/spec/vectors/reference-data.json";
import { Uuid } from "../common.ts";
import { BranchSettings } from "../dto/branch-settings.ts";
export const BranchUpdateRequest = z
  .object({
    name: z.string().min(1).max(80).optional(),
    phone: z.string().optional(),
    addressLine: z.string().max(200).optional(),
    subdistrict: z.string().optional(),
    district: z.string().optional(),
    province: z
      .string()
      .refine((p) => referenceData.provinces.includes(p))
      .optional(),
    postalCode: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    logoFileId: Uuid.optional(),
    facebookUrl: z.url().optional(),
    instagramUrl: z.url().optional(),
    receiptPrefix: z
      .string()
      .regex(/^[A-Z]{1,3}$/)
      .optional(),
  })
  .strict();
export type BranchUpdateRequest = z.infer<typeof BranchUpdateRequest>;
export const BranchUpdateResponse = BranchSettings;
export type BranchUpdateResponse = z.infer<typeof BranchUpdateResponse>;
