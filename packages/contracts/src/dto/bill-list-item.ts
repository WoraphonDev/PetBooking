import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { billStatus, paymentMethod } from "../enums.ts";

/** 05#dto-BillListItem — a row in the bill list. */
export const BillListItem = z.object({
  id: Uuid,
  receiptNo: z.string().nullable(),
  status: billStatus,
  /** owner_profile.first_name; null for a walk-in bill */
  customerName: z.string().nullable(),
  totalSatang: Money,
  paidSatang: Money,
  openedAt: IsoInstant,
  closedAt: IsoInstant.nullable(),
  /** distinct methods of the posted payments */
  methods: z.array(paymentMethod),
});
export type BillListItem = z.infer<typeof BillListItem>;
