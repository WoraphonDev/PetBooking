import { z } from "zod";
import { Uuid, Warning } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomCheckInParams = z.object({ appointmentId: Uuid });
export const GroomCheckInRequest = z
  .object({
    /** also recorded as a pet_weight row */
    weightGrams: z.number().int().min(100).max(150_000).optional(),
    conditionFlags: z.array(z.enum(["ticks_fleas", "wound", "matted", "skin_issue"])).default([]),
    conditionNote: z.string().trim().max(500).optional(),
    consent: z
      .object({
        reasons: z.array(z.enum(["matted_shave", "senior", "medical_condition", "aggressive", "other"])).default([]),
        signerName: z.string().trim().min(1).max(100).optional(),
        /** a committed-on-use `signature` PNG (R-25) */
        signatureFileId: Uuid.optional(),
      })
      .optional(),
  })
  .superRefine((b, issue) => {
    if (b.consent?.reasons.length && !b.consent.signerName)
      issue.addIssue({ code: "custom", path: ["consent", "signerName"], message: "required with consent reasons" });
    if (b.consent?.reasons.length && !b.consent.signatureFileId)
      issue.addIssue({ code: "custom", path: ["consent", "signatureFileId"], message: "required with consent reasons" });
  });
export type GroomCheckInRequest = z.infer<typeof GroomCheckInRequest>;
/** warnings: SIZE_CHANGED {newPriceSatang} when the check-in weight moves the pet to another size tier */
export const GroomCheckInResponse = AppointmentCard.extend({ warnings: z.array(Warning).optional() });
export type GroomCheckInResponse = z.infer<typeof GroomCheckInResponse>;
