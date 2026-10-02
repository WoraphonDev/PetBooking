import { z } from "zod";
import { IsoInstant, Money } from "../common.ts";
import { billStatus, paymentMethod } from "../enums.ts";
import { CustomerPackageItem } from "./customer-package-item.ts";

/** 05#dto-Receipt — receipt data for printing / LINE. */
export const Receipt = z.object({
  shopName: z.string(),
  /** address parts of the branch joined by spaces; null when none is set */
  shopAddress: z.string().nullable(),
  shopPhone: z.string().nullable(),
  /** null until object storage (T-0038) signs branch.logo_file_id (Q-0042) */
  logoUrl: z.string().nullable(),
  /** null while the bill is open */
  receiptNo: z.string().nullable(),
  closedAt: IsoInstant.nullable(),
  /** null = walk-in sale without a customer */
  customerName: z.string().nullable(),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().int(),
      unitPriceSatang: Money,
      lineDiscountSatang: Money,
      lineTotalSatang: Money,
    }),
  ),
  subtotalSatang: Money,
  billDiscountSatang: Money,
  totalSatang: Money,
  payments: z.array(z.object({ method: paymentMethod, amountSatang: Money })),
  changeSatang: Money,
  cashierName: z.string().nullable(),
  status: billStatus,
  packagesRemaining: z.array(CustomerPackageItem),
});
export type Receipt = z.infer<typeof Receipt>;
