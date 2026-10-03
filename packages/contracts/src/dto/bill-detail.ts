import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { billLineType, billStatus, paymentMethod, paymentStatus } from "../enums.ts";
import { CustomerListItem } from "./customer-list-item.ts";
import { CustomerPackageItem } from "./customer-package-item.ts";

/** 05#dto-BillDetail — a full bill. */
export const BillDetail = z.object({
  id: Uuid,
  receiptNo: z.string().nullable(),
  status: billStatus,
  /** null = walk-in sale without a customer (bill.customer_id null) */
  customer: CustomerListItem.nullable(),
  /** bookings whose bill_id = this bill */
  bookingIds: z.array(Uuid),
  subtotalSatang: Money,
  billDiscountSatang: Money,
  billDiscountReason: z.string().nullable(),
  totalSatang: Money,
  paidSatang: Money,
  /** total − paid */
  dueSatang: Money,
  changeSatang: Money,
  note: z.string().nullable(),
  openedByName: z.string(),
  openedAt: IsoInstant,
  closedAt: IsoInstant.nullable(),
  voidedAt: IsoInstant.nullable(),
  voidReason: z.string().nullable(),
  lines: z.array(
    z.object({
      id: Uuid,
      lineType: billLineType,
      description: z.string(),
      petName: z.string().nullable(),
      quantity: z.number().int(),
      unitPriceSatang: Money,
      lineDiscountSatang: Money,
      lineDiscountReason: z.string().nullable(),
      lineTotalSatang: Money,
      performerId: Uuid.nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: Uuid,
      method: paymentMethod,
      amountSatang: Money,
      tenderedSatang: Money.nullable(),
      reference: z.string().nullable(),
      status: paymentStatus,
      receivedAt: IsoInstant,
    }),
  ),
  /** customer.credit_balance_satang; 0 for a walk-in bill */
  customerCreditSatang: Money,
  /** the customer's active packages */
  availablePackages: z.array(CustomerPackageItem),
  /** Σ deposit_verified_satang of this bill's bookings with deposit_status verified and no deposit payment yet */
  depositAvailableSatang: Money,
});
export type BillDetail = z.infer<typeof BillDetail>;
