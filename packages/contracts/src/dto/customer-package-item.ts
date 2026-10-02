import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { customerPackageStatus } from "../enums.ts";

/** 05#dto-CustomerPackageItem — a package the customer holds. */
export const CustomerPackageItem = z.object({
  id: Uuid,
  templateName: z.string(),
  /** null = shared by the household */
  petId: Uuid.nullable(),
  petName: z.string().nullable(),
  sessionsTotal: z.number().int(),
  sessionsUsed: z.number().int(),
  sessionsLeft: z.number().int(),
  expiresAt: IsoInstant,
  status: customerPackageStatus,
  redemptions: z.array(
    z.object({
      redeemedAt: IsoInstant,
      petName: z.string().nullable(),
      performerName: z.string().nullable(),
      receiptNo: z.string().nullable(),
      reversedAt: IsoInstant.nullable(),
    }),
  ),
});
export type CustomerPackageItem = z.infer<typeof CustomerPackageItem>;
