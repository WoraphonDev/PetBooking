import { z } from "zod";
import { LocalTime, Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

const text = z.string().trim().max(500);
export const StaysSaveIntakeParams = z.object({ stayId: Uuid });
export const StaysSaveIntakeRequest = z.object({
  foodBrand: text.optional(),
  foodAmount: text.optional(),
  feedingTimes: z.array(LocalTime).max(6),
  foodProvidedByOwner: z.boolean(),
  walksPerDay: z.number().int().min(0).max(6),
  conditionNote: text.optional(),
  conditionPhotoIds: z.array(Uuid).max(6).optional(),
  emergencyContactName: z.string().trim().min(1).max(120),
  /** R-22 (normalised in the service) */
  emergencyContactPhone: z.string().min(1),
  vetClinicName: text.optional(),
  vetClinicPhone: z.string().max(30).optional(),
  medications: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        dose: z.string().trim().min(1).max(120),
        times: z.array(LocalTime).min(1),
        instructions: text.optional(),
      }),
    )
    .optional(),
  belongings: z
    .array(
      z.object({ item: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).default(1), photoFileId: Uuid.optional() }),
    )
    .optional(),
  complete: z.boolean(),
});
export type StaysSaveIntakeRequest = z.infer<typeof StaysSaveIntakeRequest>;
export const StaysSaveIntakeResponse = StayDetail;
export type StaysSaveIntakeResponse = z.infer<typeof StaysSaveIntakeResponse>;
