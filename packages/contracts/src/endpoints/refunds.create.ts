import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { refundMode } from "../enums.ts";

/** 05#ep-refunds.create — the shop records money it returned (transfer/cash) or turned into credit. */
export const RefundsCreateRequest = z.object({
  customerId: Uuid,
  bookingId: Uuid.optional(),
  billId: Uuid.optional(),
  amountSatang: Money.positive(),
  mode: refundMode,
  reason: z.string().trim().min(3),
  /** recommended for bank transfers; a committed `proof` file */
  proofFileId: Uuid.optional(),
});
export type RefundsCreateRequest = z.infer<typeof RefundsCreateRequest>;
/** 05: `object refund.*` */
export const RefundsCreateResponse = z.object({
  id: Uuid,
  bookingId: Uuid.nullable(),
  billId: Uuid.nullable(),
  customerId: Uuid,
  amountSatang: Money,
  mode: refundMode,
  reason: z.string(),
  proofFileId: Uuid.nullable(),
  createdBy: Uuid,
  createdAt: IsoInstant,
});
export type RefundsCreateResponse = z.infer<typeof RefundsCreateResponse>;
