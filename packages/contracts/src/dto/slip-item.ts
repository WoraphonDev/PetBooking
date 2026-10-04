import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { slipStatus } from "../enums.ts";

/** 05#dto-SlipItem — an uploaded payment slip. */
export const SlipItem = z.object({
  id: Uuid,
  bookingId: Uuid.nullable(),
  bookingNo: z.string().nullable(),
  billId: Uuid.nullable(),
  customerName: z.string(),
  /** signed URL of payment_slip.file_id */
  imageUrl: z.string().nullable(),
  amountExpectedSatang: Money,
  transRef: z.string().nullable(),
  isDuplicate: z.boolean(),
  duplicateOfSlipId: Uuid.nullable(),
  status: slipStatus,
  uploadedAt: IsoInstant,
  reviewedAt: IsoInstant.nullable(),
  rejectReason: z.string().nullable(),
  holdExpiresAt: IsoInstant.nullable(),
});
export type SlipItem = z.infer<typeof SlipItem>;
